import { execFile } from "node:child_process";
import type { TailscalePeer, TailscalePeersResponse } from "../shared/ipc.js";

let cliAvailable: boolean | null = null;
let cliAvailableCheckedAt = 0;
const CLI_CHECK_TTL_MS = 60_000; // Re-check every 60 seconds

function invalidateTailscaleCliCache(): void {
  cliAvailable = null;
  cliAvailableCheckedAt = 0;
}

async function detectTailscaleCLI(): Promise<boolean> {
  if (cliAvailable !== null && Date.now() - cliAvailableCheckedAt < CLI_CHECK_TTL_MS) {
    return cliAvailable;
  }
  const cmd = process.platform === "win32" ? "where" : "which";
  return new Promise((resolve) => {
    execFile(cmd, ["tailscale"], (err) => {
      cliAvailable = !err;
      cliAvailableCheckedAt = Date.now();
      resolve(cliAvailable);
    });
  });
}

interface CachedPeers {
  data: TailscalePeersResponse;
  fetchedAt: number;
}

let cachedPeers: CachedPeers | null = null;
const CACHE_TTL_MS = 60_000;

interface TailscaleStatusPeer {
  HostName?: string;
  DNSName?: string;
  TailscaleIPs?: string[];
  Online?: boolean;
  OS?: string;
}

interface TailscaleStatus {
  Peer?: Record<string, TailscaleStatusPeer>;
}

function parsePeers(raw: string): TailscalePeer[] {
  let parsed: TailscaleStatus;
  try {
    parsed = JSON.parse(raw) as TailscaleStatus;
  } catch {
    return [];
  }

  if (!parsed.Peer || typeof parsed.Peer !== "object") return [];

  return Object.values(parsed.Peer)
    .filter((p): p is TailscaleStatusPeer => typeof p === "object" && p !== null)
    .map((p) => ({
      hostName: p.HostName ?? "",
      dnsName: p.DNSName ?? "",
      tailscaleIPs: Array.isArray(p.TailscaleIPs)
        ? p.TailscaleIPs.filter((ip): ip is string => typeof ip === "string")
        : [],
      online: p.Online ?? false,
      os: p.OS ?? "",
    }))
    .filter((p) => p.dnsName.length > 0);
}

async function fetchPeers(): Promise<TailscalePeersResponse> {
  const available = await detectTailscaleCLI();
  if (!available) return { available: false, peers: [] };

  if (cachedPeers && Date.now() - cachedPeers.fetchedAt < CACHE_TTL_MS) {
    return cachedPeers.data;
  }

  return new Promise((resolve) => {
    execFile("tailscale", ["status", "--json"], { timeout: 10_000 }, (err, stdout) => {
      if (err) {
        // If tailscale binary not found (ENOENT), invalidate CLI cache so the
        // next call re-checks availability instead of remaining stale.
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          invalidateTailscaleCliCache();
        }
        const result: TailscalePeersResponse = {
          available: true,
          peers: [],
          error: err.message ?? "tailscale status failed",
        };
        cachedPeers = { data: result, fetchedAt: Date.now() };
        resolve(result);
        return;
      }

      const peers = parsePeers(stdout);
      const result: TailscalePeersResponse = { available: true, peers };
      cachedPeers = { data: result, fetchedAt: Date.now() };
      resolve(result);
    });
  });
}

export { detectTailscaleCLI, fetchPeers, invalidateTailscaleCliCache };
