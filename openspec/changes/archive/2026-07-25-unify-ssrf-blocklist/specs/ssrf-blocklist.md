# SSRF Blocklist Specification

## Canonical module: `src/main/ssrf-blocklist.ts`

### Exported API

```ts
interface SsrfOptions {
  allowLoopback?: boolean; // default false
}

function isUrlAllowedForFetch(url: URL, options?: SsrfOptions): boolean;
function isHostAllowed(hostname: string, options?: SsrfOptions): boolean;
```

Polarity: `true` = allowed. Rationale: allowlist polarity is the safer default — adding a new blocked host cannot accidentally grant access if the check is forgotten, and the common case is "allow public, deny dangerous".

### Blocked hosts (always, regardless of allowLoopback)

| Pattern | Reason |
|---------|--------|
| `169.254.169.254` | AWS/GCP/Azure IMDS IP |
| `169.254.169.253` | GCP metadata IP |
| `169.254.*.*` (regex) | Link-local range (RFC 3927) |
| `[fd00:ec2::254]` | AWS IPv6 metadata |
| `metadata.google.internal` | GCP metadata DNS |
| `fe80::/10` (regex on hex) | IPv6 link-local (RFC 4291) |

### Blocked when `allowLoopback` is false (default)

| Pattern | Reason |
|---------|--------|
| `localhost` | Loopback hostname |
| `127.0.0.1`, `127.*.*.*` | IPv4 loopback |
| `[::1]` | IPv6 loopback |

### Not blocked

- RFC 1918 private ranges (`10.*`, `172.16-31.*`, `192.168.*`) — used for Tailscale and internal daemons
- Tailscale CGNAT range (`100.64.0.0/10`)
- Public hostnames and IPs
