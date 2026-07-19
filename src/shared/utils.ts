// Shared pure utilities used across main, renderer, and shared layers.

import type { BootstrapSeed } from "./ipc.js";

/**
 * Compare two semver strings (e.g. "1.2.3" vs "18.0.0").
 * Returns negative if a < b, positive if a > b, zero if equal.
 * Handles optional "v" prefix.
 */
export function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

/**
 * Remove trailing slashes from a URL or path string.
 * Commonly used to normalise environment base URLs before concatenation.
 */
export function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

// ── Bootstrap seed encoding ─────────────────────────────────────────

const SEED_SCHEME = "orbion://";

/**
 * Encode a BootstrapSeed into a compact, copyable URI string.
 * Format: `orbion://<kind>:<target>#<name>`
 * - kind: "ssh" or "direct"
 * - target: for SSH "user@host:port", for direct the URL
 * - name: environment name (percent-encoded in fragment)
 */
export function encodeBootstrapSeed(seed: BootstrapSeed): string {
  const encodedName = encodeURIComponent(seed.name);
  return `${SEED_SCHEME}${seed.kind}:${seed.target}#${encodedName}`;
}

/**
 * Decode a bootstrap seed URI string into a parsed BootstrapSeed.
 * Returns null if the string is not a valid seed.
 */
export function decodeBootstrapSeed(raw: string): BootstrapSeed | null {
  if (!raw.startsWith(SEED_SCHEME)) return null;

  const rest = raw.slice(SEED_SCHEME.length);

  // Split kind from the rest (kind:target#name)
  const colonIdx = rest.indexOf(":");
  if (colonIdx < 1) return null;

  const kind = rest.slice(0, colonIdx);
  if (kind !== "ssh" && kind !== "direct") return null;

  const afterKind = rest.slice(colonIdx + 1);

  // Split target from name at the last # (target may contain # in URL, but fragment is always the last #)
  const hashIdx = afterKind.lastIndexOf("#");
  if (hashIdx < 1) return null;

  const target = afterKind.slice(0, hashIdx);
  const encodedName = afterKind.slice(hashIdx + 1);

  if (!target) return null;

  let name: string;
  try {
    name = decodeURIComponent(encodedName);
  } catch {
    return null;
  }

  if (!name) return null;

  return { kind, target, name };
}
