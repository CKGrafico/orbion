export interface SsrfOptions {
  allowLoopback?: boolean;
}

const LINK_LOCAL_IPV4 = /^169\.254\.\d{1,3}\.\d{1,3}$/;
const LOOPBACK_IPV4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const IPV6_LINK_LOCAL = /^\[?fe8[0-9a-f]:/i;

const METADATA_IPS = new Set(["169.254.169.254", "169.254.169.253"]);
const METADATA_HOSTNAMES = new Set(["metadata.google.internal"]);
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isHostAllowed(hostname: string, options?: SsrfOptions): boolean {
  const host = hostname.toLowerCase();
  const allowLoopback = options?.allowLoopback ?? false;

  if (METADATA_IPS.has(host)) return false;

  if (LINK_LOCAL_IPV4.test(host)) return false;

  if (host === "[fd00:ec2::254]") return false;

  if (IPV6_LINK_LOCAL.test(host)) return false;

  if (METADATA_HOSTNAMES.has(host)) return false;

  if (LOOPBACK_HOSTNAMES.has(host)) return allowLoopback;

  if (LOOPBACK_IPV4.test(host)) return allowLoopback;

  return true;
}

export function isUrlAllowedForFetch(url: URL, options?: SsrfOptions): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return isHostAllowed(url.hostname, options);
}
