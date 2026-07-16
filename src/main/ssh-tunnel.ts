import { spawn, type ChildProcess } from "node:child_process";
import type { SshHost, VmWizardTunnelResult } from "../shared/ipc.js";
import { validateSshHost } from "./ssh-config.js";
import { msg } from "./i18n.js";

const TUNNEL_CONNECT_TIMEOUT_MS = 15_000;

interface TunnelHandle {
  process: ChildProcess;
  localPort: number;
  remotePort: number;
  host: SshHost;
}

const activeTunnels = new Map<string, TunnelHandle>();

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

  const args: string[] = [];

  if (host.identityFile) {
    args.push("-i", host.identityFile);
  }
  if (host.port !== 22) {
    args.push("-p", String(host.port));
  }

  args.push("-N");
  args.push("-L", `${localPort}:127.0.0.1:${remotePort}`);
  args.push("-o", "StrictHostKeyChecking=accept-new");
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

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        const handle: TunnelHandle = { process: proc, localPort, remotePort, host };
        activeTunnels.set(tunnelId, handle);
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
      activeTunnels.delete(tunnelId);
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({
          forwarded: false,
          localPort: null,
          errorDetail: msg("vmWizard.mainTunnelExited", { code: code ?? -1, detail: stderrBuf.trim() }),
        });
      }
    });
  });
}

export function closeTunnel(tunnelId: string): void {
  const handle = activeTunnels.get(tunnelId);
  if (handle) {
    handle.process.kill();
    activeTunnels.delete(tunnelId);
  }
}

export function closeAllTunnels(): void {
  for (const [id, handle] of activeTunnels) {
    handle.process.kill();
    activeTunnels.delete(id);
  }
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
