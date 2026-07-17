/**
 * Tunnel registry — manages SSH port-forward tunnels for SSH-reach environments.
 *
 * When an environment has an SSH endpoint (kind === "ssh"), the main process
 * opens a local `-L` forward so the daemon's API port on the remote VM appears
 * on a local loopback port. All subsequent HTTP/SSE requests to that environment
 * use the forwarded local port as the effective base URL, so the existing
 * api:request / stream:subscribe plumbing works unchanged.
 *
 * Auto-reconnect: when an SSH tunnel process exits unexpectedly (network blip,
 * SSH keepalive timeout, etc.), the registry automatically retries reopening the
 * tunnel with exponential backoff (1 s → 2 s → 4 s → 8 s → 16 s cap), with
 * indefinite retry until connection is restored.
 *
 * Security: forwarded ports bind to 127.0.0.1 only (SSH -L default).
 */

import type { SshHost, AccessEndpoint } from "../shared/ipc.js";
import { openTunnel, closeTunnel, closeAllTunnels, getTunnelId, findExistingTunnel, onTunnelExit, isTunnelAlive, type TunnelExitEvent } from "./ssh-tunnel.js";
import { parseTarget, listSshHosts, validateSshHost } from "./ssh-config.js";

/** Port range for auto-assigned local tunnel ports. */
const TUNNEL_PORT_MIN = 19000;
const TUNNEL_PORT_MAX = 19999;

/** Exponential backoff constants for tunnel auto-reconnect. */
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 16_000;

let nextLocalPort = TUNNEL_PORT_MIN;

/** Allocate the next available local port for a tunnel. */
function allocateLocalPort(): number {
  const port = nextLocalPort;
  nextLocalPort = nextLocalPort >= TUNNEL_PORT_MAX ? TUNNEL_PORT_MIN : nextLocalPort + 1;
  return port;
}

/** Resolved SSH host info derived from an endpoint's sshTarget. */
export interface ResolvedSshTarget {
  host: SshHost;
  /** The remote daemon port extracted from the endpoint URL (default 8845). */
  remotePort: number;
}

/**
 * Registry entry — one per SSH endpoint that has an active tunnel.
 * Keyed by `${environmentId}:${endpointId}`.
 */
interface TunnelEntry {
  environmentId: string;
  endpointId: string;
  tunnelId: string;
  localPort: number;
  remotePort: number;
  /** Reconnect backoff state. Null when tunnel is connected or not retrying. */
  reconnect: ReconnectState | null;
}

/** Tracks exponential backoff state for a tunnel reconnect attempt. */
interface ReconnectState {
  failureCount: number;
  backoffMs: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
}

/** Callback type for tunnel reconnection status changes. */
export type TunnelReconnectCallback = (
  environmentId: string,
  endpointId: string,
  reconnecting: boolean,
) => void;

let reconnectCallback: TunnelReconnectCallback | null = null;

const registry = new Map<string, TunnelEntry>();

/** Registry key for a tunnel entry. */
function entryKey(environmentId: string, endpointId: string): string {
  return `${environmentId}:${endpointId}`;
}

/** Check if a tunnel's SSH process is still alive. */
function activeTunnelProcessAlive(tunnelId: string): boolean {
  return isTunnelAlive(tunnelId);
}

/**
 * Parse an SSH endpoint's sshTarget and URL to derive the SshHost + remote port.
 *
 * - sshTarget is the label string (e.g. "root@my-vm:22") stored during wizard.
 * - url is the direct URL (e.g. "http://my-vm:8845") from which we extract the port.
 */
export function resolveSshTarget(endpoint: AccessEndpoint): ResolvedSshTarget | null {
  if (endpoint.kind !== "ssh" || !endpoint.sshTarget) return null;

  // Try parsing the sshTarget as user@host[:port] format
  let host = parseTarget(endpoint.sshTarget);

  // Fallback: search known SSH hosts by label
  if (!host) {
    const knownHosts = listSshHosts();
    host = knownHosts.find((h) => h.label === endpoint.sshTarget) ?? null;
  }

  if (!host) return null;

  // Validate for safety
  try {
    validateSshHost(host);
  } catch {
    return null;
  }

  // Extract remote port from the endpoint URL (default 8845)
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

/**
 * Open a tunnel for an SSH endpoint if one isn't already running.
 * Returns the local port the tunnel is forwarded to, or null on failure.
 *
 * If a tunnel for the same host+remotePort is already active, reuses it.
 */
export async function openTunnelForEndpoint(
  environmentId: string,
  endpoint: AccessEndpoint,
): Promise<number | null> {
  const key = entryKey(environmentId, endpoint.id);

  // Already registered? Return the existing local port.
  const existing = registry.get(key);
  if (existing) {
    // Check if the tunnel is actually still alive
    const stillRunning = activeTunnelProcessAlive(existing.tunnelId);

    if (stillRunning) {
      // Clear any reconnect state from a previous cycle
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

  // Check if a tunnel to the same host:remotePort is already running
  // (could have been opened by another endpoint or the wizard).
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

  // Allocate a local port and open a new tunnel.
  const localPort = allocateLocalPort();
  const tunnelId = getTunnelId(target.host, target.remotePort);

  const result = await openTunnel(target.host, localPort, target.remotePort);

  if (!result.forwarded || !result.localPort) {
    console.error(
      `[tunnel-registry] Failed to open tunnel for ${endpoint.sshTarget}:`,
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

  console.info(
    `[tunnel-registry] Tunnel open: ${endpoint.sshTarget} → 127.0.0.1:${entry.localPort} (remote :${target.remotePort})`,
  );

  return entry.localPort;
}

/**
 * Close the tunnel for a specific environment+endpoint.
 * Safe to call even if no tunnel exists.
 * Cancels any pending reconnect attempts.
 */
export function closeTunnelForEndpoint(environmentId: string, endpointId: string): void {
  const key = entryKey(environmentId, endpointId);
  const entry = registry.get(key);
  if (!entry) return;

  // Cancel any pending reconnect timer
  if (entry.reconnect?.retryTimer) {
    clearTimeout(entry.reconnect.retryTimer);
  }

  closeTunnel(entry.tunnelId);
  registry.delete(key);

  console.info(
    `[tunnel-registry] Tunnel closed: ${entry.tunnelId} (local :${entry.localPort})`,
  );
}

/**
 * Close all tunnels for a given environment (used on environment removal).
 * Cancels any pending reconnect attempts.
 */
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

/**
 * Look up the forwarded local port for a given endpoint.
 * Returns null if no tunnel is registered.
 */
export function getTunnelLocalPort(environmentId: string, endpointId: string): number | null {
  const entry = registry.get(entryKey(environmentId, endpointId));
  return entry?.localPort ?? null;
}

/**
 * Resolve the effective API base URL for an endpoint.
 *
 * - For SSH endpoints with an active tunnel: `http://127.0.0.1:<localPort>`
 * - For all other endpoints: the endpoint's original URL unchanged.
 */
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

/**
 * Get all environments that currently have active SSH tunnels.
 * Returns a set of environment IDs.
 */
export function getTunneledEnvironmentIds(): Set<string> {
  const ids = new Set<string>();
  for (const entry of registry.values()) {
    ids.add(entry.environmentId);
  }
  return ids;
}

/**
 * Check if an SSH endpoint's tunnel is currently in reconnecting state.
 * Returns true if a reconnect attempt is in progress.
 */
export function isTunnelReconnecting(environmentId: string, endpointId: string): boolean {
  const entry = registry.get(entryKey(environmentId, endpointId));
  return entry?.reconnect !== null && entry?.reconnect !== undefined;
}

/**
 * Close all tunnels (used on app quit).
 */
export function closeAllRegistryTunnels(): void {
  // Cancel all pending reconnect timers
  for (const entry of registry.values()) {
    if (entry.reconnect?.retryTimer) {
      clearTimeout(entry.reconnect.retryTimer);
    }
  }
  registry.clear();
  closeAllTunnels();
}

/** Register a callback for tunnel reconnection status changes. */
export function onTunnelReconnect(cb: TunnelReconnectCallback): void {
  reconnectCallback = cb;
}

/**
 * Handle an unexpected tunnel exit (called from ssh-tunnel.ts via onTunnelExit).
 * Starts a reconnect cycle with exponential backoff.
 */
function handleUnexpectedTunnelExit(event: TunnelExitEvent): void {
  // Find the registry entry for this tunnel
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

  console.warn(
    `[tunnel-registry] Tunnel exited unexpectedly: ${event.tunnelId} (exit code ${event.exitCode ?? "unknown"}). Starting reconnect with backoff.`,
  );

  // Start reconnect cycle
  const failureCount = (matchingEntry.reconnect?.failureCount ?? 0) + 1;
  const backoffMs = Math.min(
    INITIAL_BACKOFF_MS * Math.pow(2, failureCount - 1),
    MAX_BACKOFF_MS,
  );

  // Clear any existing reconnect timer
  if (matchingEntry.reconnect?.retryTimer) {
    clearTimeout(matchingEntry.reconnect.retryTimer);
  }

  matchingEntry.reconnect = {
    failureCount,
    backoffMs,
    retryTimer: null,
  };

  // Notify listeners that we're reconnecting
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

    // Try to reopen the tunnel
    const envId = entry.environmentId;
    const endpointId = entry.endpointId;

    // Get the endpoint from the config store to resolve the SSH target
    try {
      const { getEnvironments } = await import("./config-store.js");
      const envs = getEnvironments();
      const env = envs.find((e: { id: string }) => e.id === envId);
      const endpoint = env?.endpoints.find((e: { id: string }) => e.id === endpointId);

      if (!endpoint) {
        // Environment or endpoint was removed while we were waiting
        entry.reconnect = null;
        return;
      }

      const result = await openTunnelForEndpoint(envId, endpoint);

      if (result !== null) {
        // Success! Reset reconnect state
        entry.reconnect = null;
        console.info(
          `[tunnel-registry] Tunnel reconnected: ${entry.tunnelId} → 127.0.0.1:${result}`,
        );

        // Notify listeners that reconnect is complete
        if (reconnectCallback) {
          reconnectCallback(envId, endpointId, false);
        }
      } else {
        // Failed again, schedule next retry
        const failureCount = (entry.reconnect?.failureCount ?? 0) + 1;
        const backoffMs = Math.min(
          INITIAL_BACKOFF_MS * Math.pow(2, failureCount - 1),
          MAX_BACKOFF_MS,
        );

        entry.reconnect = {
          failureCount,
          backoffMs,
          retryTimer: null,
        };

        console.warn(
          `[tunnel-registry] Tunnel reconnect failed for ${entry.tunnelId}. Next retry in ${backoffMs}ms (attempt ${failureCount}).`,
        );

        scheduleTunnelReconnect(key, entry);
      }
    } catch {
      // If import or anything fails, keep retrying
      const failureCount = (entry.reconnect?.failureCount ?? 0) + 1;
      const backoffMs = Math.min(
        INITIAL_BACKOFF_MS * Math.pow(2, failureCount - 1),
        MAX_BACKOFF_MS,
      );

      entry.reconnect = {
        failureCount,
        backoffMs,
        retryTimer: null,
      };

      scheduleTunnelReconnect(key, entry);
    }
  }, delay);
}

// Wire the tunnel exit callback immediately on module load
onTunnelExit(handleUnexpectedTunnelExit);

/**
 * Open tunnels for all SSH endpoints of a given environment.
 * Returns the local port for the *active* endpoint, or null.
 */
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
