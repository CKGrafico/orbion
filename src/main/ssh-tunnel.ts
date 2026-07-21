import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import type { SshHost, VmWizardTunnelResult } from "../shared/ipc.js";
import { validateSshHost } from "./ssh-config.js";
import { msg } from "./i18n.js";
import { createLogger } from "./logger.js";

const logger = createLogger("ssh-tunnel");

const TUNNEL_CONNECT_TIMEOUT_MS = 15_000;
const SIGKILL_TIMEOUT_MS = 2_000;
const PORT_VERIFY_TIMEOUT_MS = 2_000;

export interface TunnelExitEvent {
  tunnelId: string;
  host: SshHost;
  localPort: number;
  remotePort: number;
  exitCode: number | null;
}

interface TunnelHandle {
  process: ChildProcess;
  localPort: number;
  remotePort: number;
  host: SshHost;
  /** True if closeTunnel() was called intentionally (not an unexpected exit). */
  intentionalClose: boolean;
  /** Scheduled SIGKILL fallback if process doesn't exit after SIGTERM. */
  killTimer: ReturnType<typeof setTimeout> | null;
}

const activeTunnels = new Map<string, TunnelHandle>();

/** Check whether a local TCP port is accepting connections. */
export function checkLocalPort(port: number, timeoutMs: number = PORT_VERIFY_TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/** Global callback invoked when a tunnel process exits unexpectedly. */
let tunnelExitCallback: ((event: TunnelExitEvent) => void) | null = null;

/** Register a callback for unexpected tunnel exits. Only one listener is supported. */
export function onTunnelExit(cb: (event: TunnelExitEvent) => void): void {
  tunnelExitCallback = cb;
}

export function openTunnel(
  host: SshHost,
  localPort: number,
  remotePort: number,
): Promise<VmWizardTunnelResult> {
  // Validate host fields before constructing SSH arguments
  try {
    validateSshHost(host);
  } catch {
    return Promise.resolve({
      forwarded: false,
      localPort: null,
      errorDetail: msg("vmWizard.mainTunnelStartFailed", { detail: "Invalid SSH host parameters" }),
    });
  }

  const tunnelId = `${host.user}@${host.hostName}:${remotePort}`;

  const existing = activeTunnels.get(tunnelId);
  if (existing && existing.process.exitCode === null) {
    return Promise.resolve({
      forwarded: true,
      localPort: existing.localPort,
      errorDetail: null,
    });
  }

  // Track whether this handle has been registered yet (set after the promise resolves
  // and the handle enters activeTunnels). This prevents the exit handler from firing
  // for pre-resolution exits (auth failures, etc.).
  let registered = false;

  const args: string[] = [];

  if (host.identityFile) {
    args.push("-i", host.identityFile);
  }
  if (host.port !== 22) {
    args.push("-p", String(host.port));
  }

  args.push("-N");
  args.push("-L", `${localPort}:127.0.0.1:${remotePort}`);
  args.push("-o", "StrictHostKeyChecking=yes");
  args.push("-o", "ConnectTimeout=10");
  args.push("-o", "ServerAliveInterval=15");
  args.push("-o", "ServerAliveCountMax=3");
  args.push("-o", "ExitOnForwardFailure=yes");
  args.push("-o", "BatchMode=yes");

  args.push(`${host.user}@${host.hostName}`);

  return new Promise((resolve) => {
    const proc = spawn("ssh", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let resolved = false;
    let stderrBuf = "";

    const timeout = setTimeout(async () => {
      if (!resolved) {
        const portReachable = await checkLocalPort(localPort);
        if (resolved) return;
        if (!portReachable) {
          resolved = true;
          proc.kill();
          logger.warn(`Tunnel timeout: port ${localPort} not reachable after ${TUNNEL_CONNECT_TIMEOUT_MS}ms`);
          resolve({
            forwarded: false,
            localPort: null,
            errorDetail: msg("vmWizard.mainTunnelForwardingFailed", { detail: "Port verification failed" }),
          });
          return;
        }
        resolved = true;
        const handle: TunnelHandle = { process: proc, localPort, remotePort, host, intentionalClose: false, killTimer: null };
        activeTunnels.set(tunnelId, handle);
        registered = true;
        resolve({
          forwarded: true,
          localPort,
          errorDetail: null,
        });
      }
    }, TUNNEL_CONNECT_TIMEOUT_MS);

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();

      if (!resolved) {
        const lower = stderrBuf.toLowerCase();
        if (lower.includes("permission denied") || lower.includes("authentication failed")) {
          resolved = true;
          clearTimeout(timeout);
          proc.kill();
          resolve({
            forwarded: false,
            localPort: null,
            errorDetail: msg("vmWizard.mainTunnelAuthFailed"),
          });
        } else if (lower.includes("channel_setup") || lower.includes("forwarding")) {
          resolved = true;
          clearTimeout(timeout);
          proc.kill();
          resolve({
            forwarded: false,
            localPort: null,
            errorDetail: msg("vmWizard.mainTunnelForwardingFailed", { detail: stderrBuf.trim() }),
          });
        }
      }
    });

    proc.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({
          forwarded: false,
          localPort: null,
          errorDetail: msg("vmWizard.mainTunnelStartFailed", { detail: err.message }),
        });
      }
    });

    proc.on("exit", (code) => {
      const handle = activeTunnels.get(tunnelId);
      const wasIntentional = handle?.intentionalClose ?? false;
      if (handle?.killTimer) {
        clearTimeout(handle.killTimer);
        handle.killTimer = null;
      }
      activeTunnels.delete(tunnelId);

      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({
          forwarded: false,
          localPort: null,
          errorDetail: msg("vmWizard.mainTunnelExited", { code: code ?? -1, detail: stderrBuf.trim() }),
        });
        return;
      }

      // After initial resolution: unexpected exit (not closeTunnel-initiated)
      if (registered && !wasIntentional && tunnelExitCallback) {
        tunnelExitCallback({
          tunnelId,
          host,
          localPort,
          remotePort,
          exitCode: code,
        });
      }
    });
  });
}

export function closeTunnel(tunnelId: string): void {
  const handle = activeTunnels.get(tunnelId);
  if (!handle) return;
  handle.intentionalClose = true;
  if (handle.process.exitCode === null) {
    handle.process.kill();
    handle.killTimer = setTimeout(() => {
      handle.killTimer = null;
      if (handle.process.exitCode === null) {
        handle.process.kill("SIGKILL");
      }
    }, SIGKILL_TIMEOUT_MS);
  } else {
    activeTunnels.delete(tunnelId);
  }
}

export function closeAllTunnels(): void {
  for (const [id, handle] of activeTunnels) {
    handle.intentionalClose = true;
    if (handle.process.exitCode === null) {
      handle.process.kill();
      handle.killTimer = setTimeout(() => {
        handle.killTimer = null;
        if (handle.process.exitCode === null) {
          handle.process.kill("SIGKILL");
        }
      }, SIGKILL_TIMEOUT_MS);
    } else {
      activeTunnels.delete(id);
    }
  }
}

/** Synchronous last-resort kill: sends SIGKILL to all tracked tunnel processes.
 *  Used from process.on("exit") where async timers cannot fire. */
export function forceKillAllTunnels(): void {
  for (const handle of activeTunnels.values()) {
    if (handle.process.exitCode === null) {
      try {
        handle.process.kill("SIGKILL");
      } catch {
        // Process may have already exited between check and kill
      }
    }
  }
  activeTunnels.clear();
}

export function getTunnelId(host: SshHost, remotePort: number): string {
  return `${host.user}@${host.hostName}:${remotePort}`;
}

export function findExistingTunnel(host: SshHost, remotePort: number): TunnelHandle | undefined {
  const tunnelId = getTunnelId(host, remotePort);
  const handle = activeTunnels.get(tunnelId);
  if (handle && handle.process.exitCode === null) return handle;
  return undefined;
}

/** Check if a tunnel process is still alive by its tunnelId. */
export function isTunnelAlive(tunnelId: string): boolean {
  const handle = activeTunnels.get(tunnelId);
  return handle !== undefined && handle.process.exitCode === null;
}
