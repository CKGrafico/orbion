// Allowlist polarity (returns true for allowed) — blocklist polarity inverted
// the check result, which caused missed negations and drift between consumers; see issue #339.

export interface SsrfOptions {
  allowLoopback?: boolean;
}

const CLOUD_METADATA_IPS = new Set([
  "169.254.169.254",
  "169.254.169.253",
]);

const CLOUD_METADATA_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata.google.internal.",
  "metadata.azure.internal",
  "metadata.azure.internal.",
]);

const IPV4_LINK_LOCAL = /^169\.254\.\d{1,3}\.\d{1,3}$/;
const IPV4_LOOPBACK = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

function isIpv6LinkLocal(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (!h.startsWith("[") || !h.endsWith("]")) return false;
  const addr = h.slice(1, -1);
  return /^fe8[0-9a-f]:/i.test(addr) || addr === "fe80::";
}

export function isHostAllowed(hostname: string, options?: SsrfOptions): boolean {
  const host = hostname.toLowerCase();
  const allowLoopback = options?.allowLoopback ?? false;

  if (CLOUD_METADATA_HOSTNAMES.has(host)) return false;

  if (CLOUD_METADATA_IPS.has(host)) return false;

  if (IPV4_LINK_LOCAL.test(host)) return false;

  if (host === "[fd00:ec2::254]") return false;

  if (isIpv6LinkLocal(host)) return false;

  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || IPV4_LOOPBACK.test(host)) {
    return allowLoopback;
  }

  return true;
}

export function isUrlAllowedForFetch(url: URL, options?: SsrfOptions): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return isHostAllowed(url.hostname, options);
}

export function isAllowedBaseUrl(baseUrl: string, options?: SsrfOptions): boolean {
  try {
    const url = new URL(baseUrl);
    return isUrlAllowedForFetch(url, options);
  } catch {
    return false;
  }
}
