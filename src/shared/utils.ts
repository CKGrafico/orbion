import type { BootstrapSeed } from "./ipc.js";

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

export function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

const SEED_SCHEME = "orbion://";

/** Encode a BootstrapSeed into a compact, copyable URI string.
 *  Format: `orbion://<kind>:<target>#<name>` */
export function encodeBootstrapSeed(seed: BootstrapSeed): string {
  const encodedName = encodeURIComponent(seed.name);
  return `${SEED_SCHEME}${seed.kind}:${seed.target}#${encodedName}`;
}

/** Decode a bootstrap seed URI string. Returns null if not a valid seed. */
export function decodeBootstrapSeed(raw: string): BootstrapSeed | null {
  if (!raw.startsWith(SEED_SCHEME)) return null;

  const rest = raw.slice(SEED_SCHEME.length);

  const colonIdx = rest.indexOf(":");
  if (colonIdx < 1) return null;

  const kind = rest.slice(0, colonIdx);
  if (kind !== "ssh" && kind !== "direct") return null;

  const afterKind = rest.slice(colonIdx + 1);

  // Fragment is always the last # (target may contain # in URL)
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
