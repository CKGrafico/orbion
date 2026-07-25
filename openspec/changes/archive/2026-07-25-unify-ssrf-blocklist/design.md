## Context

Two host-validation functions guard different trust boundaries against SSRF:

- `isBlocklistedHost()` in `ipc-validation.ts` — blocklist polarity, no loopback handling, no IPv6 link-local, no DNS metadata hostnames.
- `isAllowedHost()` in `index.ts` — allowlist polarity, has loopback handling, same gaps.

Both are private, untested directly (tests duplicate the logic inline), and drift silently when one is updated without the other.

## Goals / Non-Goals

**Goals:**
- Single canonical module with one allowlist-polarity entry point.
- Block IPv6 link-local (`fe80::/10`), cloud DNS metadata hostnames, and all existing vectors.
- Both `ipc-validation.ts` and `index.ts` call the canonical function — no duplicated logic.
- Comprehensive test covering both call paths and all vectors.

**Non-Goals:**
- DNS resolution blocking (a hostname that resolves to a blocked IP is not caught at URL-parse level; this is an accepted limitation documented in code).
- Azure IMDS header-level blocking (the `Metadata: true` header path is a request-level concern, not a URL-level concern).
- Blocking private RFC 1918 ranges (`10.x`, `172.16-31.x`, `192.168.x`) — these are allowed in the current design for Tailscale/local-network use.

## Decisions

1. **Module path**: `src/main/ssrf-allowlist.ts`. Placed alongside other main-process security modules.
2. **Polarity**: Allowlist — function returns `true` for allowed hosts. Rationale: the upstream spec (`host-blocklist`) defines requirements in terms of "SHALL reject" which maps naturally to `!isAllowed`.
3. **Entry point**: `isUrlAllowedForFetch(url: URL, options?: { allowLoopback?: boolean }): boolean`. Accepts a parsed URL for zero-alloc reuse. Options mirror the existing `allowLoopback` semantics.
4. **Loopback handling**: `allowLoopback` defaults to `false`. Callers in `ipc-validation.ts` pass `allowLoopback: true` (environment registration allows localhost). Callers in `index.ts` for API requests pass `allowLoopback: false` with tunnel-port override handled at the call site.
5. **IPv6 link-local**: Match `fe80::/10` by checking if the bracketed hostname starts with `[fe80:` (case-insensitive).
6. **Cloud DNS metadata**: Block hostnames `metadata.google.internal` and `metadata.google.internal.` (trailing-dot FQDN form). These resolve to GCP metadata. AWS metadata is already covered by `169.254.169.254/169.254.169.253` IP blocks.
7. **`isAllowedBaseUrl` and `isEffectiveUrlAllowed`** remain in `index.ts` as thin wrappers that call the canonical module. This preserves the tunnel-port override logic in `isEffectiveUrlAllowed` without moving SSH-tunnel awareness into the security module.
8. **`ipc-validation.ts`** replaces `isBlocklistedHost` with a call to `!isUrlAllowedForFetch`. The `isBlocklistedHost` function is deleted.

## Risks / Trade-offs

- **No DNS-resolution blocking**: A hostname like `evil.com` could resolve to `169.254.169.254`. Mitigating this requires runtime DNS queries, which add latency and complexity. Not in scope.
- **Cloud metadata hostnames**: Only Google's is blocked by hostname. Azure and AWS use IP-based metadata only. If Azure adds a DNS metadata hostname, the blocklist must be updated.
- **Behavioral change for IPC validation**: Currently `isBlocklistedHost` does not block loopback; the canonical module with `allowLoopback: true` preserves this. No user-visible change.
