## Why

Two independent SSRF host-validation implementations (`isBlocklistedHost` in `ipc-validation.ts` and `isAllowedHost` in `index.ts`) diverge in scope, polarity, and coverage. Neither blocks IPv6 link-local (`fe80::/10`) or cloud-provider DNS metadata hostnames (`metadata.google.internal`). A new SSRF vector added to one but not the other creates a bypass. This is security drift.

## What Changes

- Extract a single `src/main/ssrf-allowlist.ts` module containing the canonical host-validation logic as `isUrlAllowedForFetch(url, options)` with allowlist polarity.
- Block IPv6 link-local (`fe80::/10`), cloud-provider DNS metadata hostnames, and all existing SSRF vectors in one place.
- `ipc-validation.ts` replaces its private `isBlocklistedHost` with the canonical function.
- `index.ts` replaces its private `isAllowedHost`, `isAllowedBaseUrl`, and `isEffectiveUrlAllowed` with thin wrappers or direct calls to the canonical function.
- Updates `tests/host-blocklist.test.ts` to import from the canonical module instead of duplicating logic inline.
- Adds a unified test suite verifying both call paths produce identical allow/deny results for a comprehensive URL set.

## Capabilities

### New Capabilities
- `unified-ssrf-validation`: canonical SSRF host-validation module with single allowlist-polarity function, IPv6 link-local blocking, cloud DNS metadata blocking, and comprehensive test coverage.

### Modified Capabilities
- `host-blocklist`: requirements extended to cover IPv6 link-local, cloud DNS metadata hostnames, and unified polarity.

## Impact

- `src/main/ssrf-allowlist.ts` (new file)
- `src/main/ipc-validation.ts` (replace `isBlocklistedHost` with import)
- `src/main/index.ts` (replace `isAllowedHost`/`isAllowedBaseUrl`/`isEffectiveUrlAllowed` with imports)
- `tests/host-blocklist.test.ts` (rewrite to import from canonical module)
- `tests/ipc-validation.test.ts` (add IPv6 link-local and DNS metadata test cases)
- No IPC channel changes. No dependency additions. No UI changes.
