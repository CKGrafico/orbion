// Allowlist polarity (returns true for allowed) — blocklist polarity was
// inverted and error-prone; see issue #339.

export interface SsrfAllowOptions {
  allowLoopback?: boolean;
}

const CLOUD_METADATA_DNS_HOSTS = new Set([
  "metadata.google.internal",
  "metadata.google.internal.",
  "metadata.azure.internal",
  "metadata.azure.internal.",
]);

export function isHostAllowed(hostname: string, options?: SsrfAllowOptions): boolean {
  const allowLoopback = options?.allowLoopback ?? false;
  const host = hostname.toLowerCase();

  if (isLoopbackHost(host)) return allowLoopback;
  if (isCloudMetadataIp(host)) return false;
  if (isLinkLocalRange(host)) return false;
  if (isAwsIpv6Metadata(host)) return false;
  if (isIpv6LinkLocal(host)) return false;
  if (isCloudMetadataDns(host)) return false;
  if (isLoopbackRange(host)) return allowLoopback;
  return true;
}

export function isUrlAllowedForFetch(url: URL, options?: SsrfAllowOptions): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return isHostAllowed(url.hostname, options);
}

export function isAllowedBaseUrl(baseUrl: string, options?: SsrfAllowOptions): boolean {
  try {
    const url = new URL(baseUrl);
    return isUrlAllowedForFetch(url, options);
  } catch {
    return false;
  }
}

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

function isLoopbackRange(host: string): boolean {
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

function isCloudMetadataIp(host: string): boolean {
  return host === "169.254.169.254" || host === "169.254.169.253";
}

function isLinkLocalRange(host: string): boolean {
  return /^169\.254\.\d{1,3}\.\d{1,3}$/.test(host);
}

function isAwsIpv6Metadata(host: string): boolean {
  return host === "[fd00:ec2::254]";
}

function isIpv6LinkLocal(host: string): boolean {
  return host.startsWith("[fe80:") || host.startsWith("[FE80:");
}

function isCloudMetadataDns(host: string): boolean {
  return CLOUD_METADATA_DNS_HOSTS.has(host);
}
