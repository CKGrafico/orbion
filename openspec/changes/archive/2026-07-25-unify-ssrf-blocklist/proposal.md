# Unify SSRF host blocklists

**Archived:** 2026-07-25

## Issue
#339 — Divergent host blocklists: ipc-validation.ts and index.ts implement separate SSRF allowlists

## Problem
Two independent blocklist implementations protect different trust boundaries but are not synchronized:

- `isBlocklistedHost()` in `ipc-validation.ts` — blocklist polarity, no loopback handling
- `isAllowedHost()` in `index.ts` — allowlist polarity, loopback via `allowLoopback` flag

Gaps in both:
- No IPv6 link-local (`fe80::/10`) block
- No GCP metadata DNS hostname block (`metadata.google.internal`)
- No Azure IMDS DNS hostname block (`metadata.azure.internal`)
- Opposite polarity makes accidental negation easy

## Fix
1. Extract single `src/main/ssrf-blocklist.ts` with `isHostAllowed`, `isUrlAllowedForFetch`, `isAllowedBaseUrl`
2. Both consumers import from canonical module — no duplicated logic
3. Block IPv6 link-local (bracket-aware), cloud provider DNS metadata hostnames (GCP + Azure), future SSRF vectors in one place
4. Use allowlist polarity consistently — `true` = allowed
5. Parity test: both call paths produce same allow/deny for comprehensive test URL set

## Verification
- 69 host-blocklist tests pass (including metadata.azure.internal, isAllowedBaseUrl, parity)
- 88 IPC validation tests pass
- `pnpm typecheck` clean
- `pnpm check:comments` clean
