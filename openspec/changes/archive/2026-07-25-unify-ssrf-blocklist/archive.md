# Archive: Unify SSRF host blocklists

**Change ID:** unify-ssrf-blocklist
**Issue:** #339
**Archived:** 2026-07-25
**Status:** Passed

## Summary

Consolidated two divergent SSRF blocklist implementations into a single canonical `src/main/ssrf-blocklist.ts` module. Both `ipc-validation.ts` and `index.ts` now import from this module — no duplicated logic.

## Changes

- Created `src/main/ssrf-blocklist.ts` with `isHostAllowed`, `isUrlAllowedForFetch`, `isAllowedBaseUrl`
- Refactored `ipc-validation.ts` — replaced inline `isBlocklistedHost` with import from canonical module
- Refactored `index.ts` — replaced inline `isAllowedHost`/`isAllowedBaseUrl` with imports from canonical module
- Added IPv6 link-local (`fe80::/10`) blocking with bracket-aware helper
- Added GCP metadata DNS hostname (`metadata.google.internal`) blocking
- Added Azure IMDS DNS hostname (`metadata.azure.internal`) blocking
- Added trailing-dot FQDN variants for both cloud metadata hostnames
- Used allowlist polarity consistently (`true` = allowed)
- Rewrote `tests/host-blocklist.test.ts` with 73 comprehensive tests including parity verification

## Evidence

- 73 host-blocklist tests pass (isHostAllowed, isUrlAllowedForFetch, isAllowedBaseUrl, IPC parity)
- 88 IPC validation tests pass
- `pnpm typecheck` clean
- `pnpm check:comments` clean

## Files Changed

- `src/main/ssrf-blocklist.ts` (new)
- `src/main/ipc-validation.ts` (refactored)
- `src/main/index.ts` (refactored)
- `tests/host-blocklist.test.ts` (rewritten)
- `ARCHITECTURE.md` (updated)
