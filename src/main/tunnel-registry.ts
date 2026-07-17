/**
 * Tunnel registry — manages SSH port-forward tunnels for SSH-reach environments.
 *
 * When an environment has an SSH endpoint (kind === "ssh"), the main process
 * opens a local `-L` forward so the daemon's API port on the remote VM appears
 * on a local loopback port. All subsequent HTTP/SSE requests to that environment
 * use the forwarded local port as the effective base URL, so the existing
 * api:request / stream:subscribe plumbing works unchanged.
 *
 * Security: forwarded ports bind to 127.0.0.1 only (SSH -L default).
 */

import type { SshHost, AccessEndpoint } from "../shared/ipc.js";
import { openTunnel, closeTunnel, closeAllTunnels, getTunnelId, findExistingTunnel } from "./ssh-tunnel.js";
import { parseTarget, listSshHosts, validateSshHost } from "./ssh-config.js";

/** Port range for auto-assigned local tunnel ports. */
const TUNNEL_PORT_MIN = 19000;
const TUNNEL_PORT_MAX = 19999;

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
}

const registry = new Map<string, TunnelEntry>();

/** Registry key for a tunnel entry. */
function entryKey(environmentId: string, endpointId: string): string {
  return `${environmentId}:${endpointId}`;
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
  if (existing) return existing.localPort;

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
 */
export function closeTunnelForEndpoint(environmentId: string, endpointId: string): void {
  const key = entryKey(environmentId, endpointId);
  const entry = registry.get(key);
  if (!entry) return;

  closeTunnel(entry.tunnelId);
  registry.delete(key);

  console.info(
    `[tunnel-registry] Tunnel closed: ${entry.tunnelId} (local :${entry.localPort})`,
  );
}

/**
 * Close all tunnels for a given environment (used on environment removal).
 */
export function closeTunnelsForEnvironment(environmentId: string): void {
  const keysToRemove: string[] = [];
  for (const [key, entry] of registry) {
    if (entry.environmentId === environmentId) {
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
 * Close all tunnels (used on app quit).
 */
export function closeAllRegistryTunnels(): void {
  registry.clear();
  closeAllTunnels();
}

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
