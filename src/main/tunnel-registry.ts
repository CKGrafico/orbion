/**
 * Tunnel registry — manages SSH port-forward tunnels for SSH-reach environments.
 *
 * Auto-reconnect: when an SSH tunnel process exits unexpectedly, the registry
 * automatically retries reopening with exponential backoff (1 s → 2 s → 4 s →
 * 8 s → 16 s cap), with indefinite retry until connection is restored.
 *
 * Security: forwarded ports bind to 127.0.0.1 only (SSH -L default).
 */

import type { SshHost, AccessEndpoint } from "../shared/ipc.js";
import { createLogger } from "./logger.js";
import { openTunnel, closeTunnel, closeAllTunnels, forceKillAllTunnels, getTunnelId, findExistingTunnel, onTunnelExit, isTunnelAlive, type TunnelExitEvent } from "./ssh-tunnel.js";
import { parseTarget, listSshHosts, validateSshHost } from "./ssh-config.js";

const logger = createLogger("tunnel-registry");

const TUNNEL_PORT_MIN = 19000;
const TUNNEL_PORT_MAX = 19999;

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 16_000;

let nextLocalPort = TUNNEL_PORT_MIN;

function allocateLocalPort(): number {
  const port = nextLocalPort;
  nextLocalPort = nextLocalPort >= TUNNEL_PORT_MAX ? TUNNEL_PORT_MIN : nextLocalPort + 1;
  return port;
}

export interface ResolvedSshTarget {
  host: SshHost;
  remotePort: number;
}

interface TunnelEntry {
  environmentId: string;
  endpointId: string;
  tunnelId: string;
  localPort: number;
  remotePort: number;
  reconnect: ReconnectState | null;
}

interface ReconnectState {
  failureCount: number;
  backoffMs: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
}

export type TunnelReconnectCallback = (
  environmentId: string,
  endpointId: string,
  reconnecting: boolean,
) => void;

let reconnectCallback: TunnelReconnectCallback | null = null;

const registry = new Map<string, TunnelEntry>();

function entryKey(environmentId: string, endpointId: string): string {
  return `${environmentId}:${endpointId}`;
}

function activeTunnelProcessAlive(tunnelId: string): boolean {
  return isTunnelAlive(tunnelId);
}

/** Parse an SSH endpoint's sshTarget and URL to derive the SshHost + remote port.
 *  sshTarget: "root@my-vm:22" format. URL: "http://my-vm:8845" for port extraction. */
export function resolveSshTarget(endpoint: AccessEndpoint): ResolvedSshTarget | null {
  if (endpoint.kind !== "ssh" || !endpoint.sshTarget) return null;

  let host = parseTarget(endpoint.sshTarget);

  // Fallback: search known SSH hosts by label
  if (!host) {
    const knownHosts = listSshHosts();
    host = knownHosts.find((h) => h.label === endpoint.sshTarget) ?? null;
  }

  if (!host) return null;

  try {
    validateSshHost(host);
  } catch {
    return null;
  }

  let remotePort = 8845;
  try {
    const url = new URL(endpoint.url);
    if (url.port) {
      remotePort = parseInt(url.port, 10);
      if (!Number.isSafeInteger(remotePort) || remotePort < 1 || remotePort > 65535) {
        remotePort = 8845;
      }
    }
  } catch {
    // keep default
  }

  return { host, remotePort };
}

/** Open a tunnel for an SSH endpoint if one isn't already running. Reuses existing tunnels to the same host+remotePort. */
export async function openTunnelForEndpoint(
  environmentId: string,
  endpoint: AccessEndpoint,
): Promise<number | null> {
  const key = entryKey(environmentId, endpoint.id);

  const existing = registry.get(key);
  if (existing) {
    const stillRunning = activeTunnelProcessAlive(existing.tunnelId);

    if (stillRunning) {
      if (existing.reconnect) {
        if (existing.reconnect.retryTimer) {
          clearTimeout(existing.reconnect.retryTimer);
        }
        existing.reconnect = null;
        if (reconnectCallback) {
          reconnectCallback(environmentId, endpoint.id, false);
        }
      }
      return existing.localPort;
    }
    // Tunnel process is dead — remove stale entry and fall through to open a new one
    if (existing.reconnect?.retryTimer) {
      clearTimeout(existing.reconnect.retryTimer);
    }
    registry.delete(key);
  }

  const target = resolveSshTarget(endpoint);
  if (!target) return null;

  const existingTunnel = findExistingTunnel(target.host, target.remotePort);
  if (existingTunnel) {
    const entry: TunnelEntry = {
      environmentId,
      endpointId: endpoint.id,
      tunnelId: getTunnelId(target.host, target.remotePort),
      localPort: existingTunnel.localPort,
      remotePort: target.remotePort,
      reconnect: null,
    };
    registry.set(key, entry);
    return entry.localPort;
  }

  const localPort = allocateLocalPort();
  const tunnelId = getTunnelId(target.host, target.remotePort);

  const result = await openTunnel(target.host, localPort, target.remotePort);

  if (!result.forwarded || !result.localPort) {
    logger.error(
      `Failed to open tunnel for ${endpoint.sshTarget}:`,
      result.errorDetail,
    );
    return null;
  }

  const entry: TunnelEntry = {
    environmentId,
    endpointId: endpoint.id,
    tunnelId,
    localPort: result.localPort,
    remotePort: target.remotePort,
    reconnect: null,
  };
  registry.set(key, entry);

  logger.info(
    `Tunnel open: ${endpoint.sshTarget} to 127.0.0.1:${entry.localPort} (remote :${target.remotePort})`,
  );

  return entry.localPort;
}

/** Close the tunnel for a specific environment+endpoint. Cancels any pending reconnect attempts. */
export function closeTunnelForEndpoint(environmentId: string, endpointId: string): void {
  const key = entryKey(environmentId, endpointId);
  const entry = registry.get(key);
  if (!entry) return;

  if (entry.reconnect?.retryTimer) {
    clearTimeout(entry.reconnect.retryTimer);
  }

  closeTunnel(entry.tunnelId);
  registry.delete(key);

  logger.info(
    `Tunnel closed: ${entry.tunnelId} (local :${entry.localPort})`,
  );
}

/** Close all tunnels for a given environment. Cancels any pending reconnect attempts. */
export function closeTunnelsForEnvironment(environmentId: string): void {
  const keysToRemove: string[] = [];
  for (const [key, entry] of registry) {
    if (entry.environmentId === environmentId) {
      if (entry.reconnect?.retryTimer) {
        clearTimeout(entry.reconnect.retryTimer);
      }
      closeTunnel(entry.tunnelId);
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    registry.delete(key);
  }
}

export function getTunnelLocalPort(environmentId: string, endpointId: string): number | null {
  const entry = registry.get(entryKey(environmentId, endpointId));
  return entry?.localPort ?? null;
}

/** Used by host validation to exempt loopback URLs that route through tunnels. */
export function isTunnelLocalPort(port: number): boolean {
  for (const entry of registry.values()) {
    if (entry.localPort === port) return true;
  }
  return false;
}

/** - SSH endpoints with an active tunnel: `http://127.0.0.1:<localPort>`
 *  - All other endpoints: the endpoint's original URL unchanged. */
export function resolveEffectiveUrl(
  environmentId: string,
  endpoint: AccessEndpoint,
): string {
  if (endpoint.kind === "ssh") {
    const localPort = getTunnelLocalPort(environmentId, endpoint.id);
    if (localPort) {
      return `http://127.0.0.1:${localPort}`;
    }
  }
  return endpoint.url;
}

export function getTunneledEnvironmentIds(): Set<string> {
  const ids = new Set<string>();
  for (const entry of registry.values()) {
    ids.add(entry.environmentId);
  }
  return ids;
}

export function isTunnelReconnecting(environmentId: string, endpointId: string): boolean {
  const entry = registry.get(entryKey(environmentId, endpointId));
  return entry?.reconnect !== null && entry?.reconnect !== undefined;
}

/** Close all tunnels (used on app quit). */
export async function closeAllRegistryTunnels(): Promise<void> {
  for (const entry of registry.values()) {
    if (entry.reconnect?.retryTimer) {
      clearTimeout(entry.reconnect.retryTimer);
    }
  }
  registry.clear();
  await closeAllTunnels();
}

export function onTunnelReconnect(cb: TunnelReconnectCallback): void {
  reconnectCallback = cb;
}

/** Synchronous last-resort kill for process exit. Sends SIGKILL to all SSH tunnel child processes. */
export function forceKillAllRegistryTunnels(): void {
  for (const entry of registry.values()) {
    if (entry.reconnect?.retryTimer) {
      clearTimeout(entry.reconnect.retryTimer);
    }
  }
  registry.clear();
  forceKillAllTunnels();
}

/** Handle an unexpected tunnel exit (called from ssh-tunnel.ts). Starts a reconnect cycle with exponential backoff. */
function handleUnexpectedTunnelExit(event: TunnelExitEvent): void {
  let matchingEntry: TunnelEntry | null = null;
  let matchingKey: string | null = null;

  for (const [key, entry] of registry) {
    if (entry.tunnelId === event.tunnelId) {
      matchingEntry = entry;
      matchingKey = key;
      break;
    }
  }

  if (!matchingEntry || !matchingKey) {
    // Tunnel not tracked in registry (maybe from a wizard session) — ignore
    return;
  }

  logger.warn(
    `Tunnel exited unexpectedly: ${event.tunnelId} (exit code ${event.exitCode ?? "unknown"}). Starting reconnect with backoff.`,
  );

  const failureCount = (matchingEntry.reconnect?.failureCount ?? 0) + 1;
  const backoffMs = Math.min(
    INITIAL_BACKOFF_MS * Math.pow(2, failureCount - 1),
    MAX_BACKOFF_MS,
  );

  if (matchingEntry.reconnect?.retryTimer) {
    clearTimeout(matchingEntry.reconnect.retryTimer);
  }

  matchingEntry.reconnect = {
    failureCount,
    backoffMs,
    retryTimer: null,
  };

  if (reconnectCallback) {
    reconnectCallback(matchingEntry.environmentId, matchingEntry.endpointId, true);
  }

  scheduleTunnelReconnect(matchingKey, matchingEntry);
}

function scheduleTunnelReconnect(key: string, entry: TunnelEntry): void {
  if (!entry.reconnect) return;

  const delay = entry.reconnect.backoffMs;

  entry.reconnect.retryTimer = setTimeout(async () => {
    if (!entry.reconnect) return;

    entry.reconnect.retryTimer = null;

    const envId = entry.environmentId;
    const endpointId = entry.endpointId;

    try {
      const { getEnvironments } = await import("./config-store.js");
      const envs = getEnvironments();
      const env = envs.find((e: { id: string }) => e.id === envId);
      const endpoint = env?.endpoints.find((e: { id: string }) => e.id === endpointId);

      if (!endpoint) {
        const fresh = registry.get(key);
        if (fresh) {
          if (fresh.reconnect?.retryTimer) {
            clearTimeout(fresh.reconnect.retryTimer);
          }
          fresh.reconnect = null;
        }
        return;
      }

      const result = await openTunnelForEndpoint(envId, endpoint);

      // openTunnelForEndpoint may delete the old entry and create a new one
      // when the tunnel process was dead. Look up the fresh entry instead.
      const freshEntry = registry.get(key);

      if (result !== null) {
        if (freshEntry) {
          if (freshEntry.reconnect?.retryTimer) {
            clearTimeout(freshEntry.reconnect.retryTimer);
          }
          freshEntry.reconnect = null;
        }
        logger.info(
          `Tunnel reconnected: ${freshEntry?.tunnelId ?? entry.tunnelId} to 127.0.0.1:${result}`,
        );

        if (reconnectCallback) {
          reconnectCallback(envId, endpointId, false);
        }
      } else {
        const currentFailureCount = (freshEntry?.reconnect?.failureCount ?? (entry.reconnect?.failureCount ?? 0)) + 1;
        const backoffMs = Math.min(
          INITIAL_BACKOFF_MS * Math.pow(2, currentFailureCount - 1),
          MAX_BACKOFF_MS,
        );

        if (freshEntry) {
          freshEntry.reconnect = {
            failureCount: currentFailureCount,
            backoffMs,
            retryTimer: null,
          };
        }

        const logTunnelId = freshEntry?.tunnelId ?? entry.tunnelId;
        logger.warn(
          `Tunnel reconnect failed for ${logTunnelId}. Next retry in ${backoffMs}ms (attempt ${currentFailureCount}).`,
        );

        scheduleTunnelReconnect(key, freshEntry ?? entry);
      }
    } catch {
      const freshEntry = registry.get(key);
      const currentFailureCount = (freshEntry?.reconnect?.failureCount ?? (entry.reconnect?.failureCount ?? 0)) + 1;
      const backoffMs = Math.min(
        INITIAL_BACKOFF_MS * Math.pow(2, currentFailureCount - 1),
        MAX_BACKOFF_MS,
      );

      if (freshEntry) {
        freshEntry.reconnect = {
          failureCount: currentFailureCount,
          backoffMs,
          retryTimer: null,
        };
      }

      scheduleTunnelReconnect(key, freshEntry ?? entry);
    }
  }, delay);
}

onTunnelExit(handleUnexpectedTunnelExit);

/** Open tunnels for all SSH endpoints of a given environment. Returns the local port for the *active* endpoint, or null. */
export async function openTunnelsForEnvironment(
  environmentId: string,
  endpoints: AccessEndpoint[],
  activeEndpointId: string | null,
): Promise<number | null> {
  let activePort: number | null = null;

  for (const ep of endpoints) {
    if (ep.kind !== "ssh") continue;

    const port = await openTunnelForEndpoint(environmentId, ep);
    if (ep.id === activeEndpointId) {
      activePort = port;
    }
  }

  return activePort;
}
