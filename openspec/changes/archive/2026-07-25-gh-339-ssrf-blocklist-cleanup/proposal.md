## Why

Issue #339 divergent SSRF blocklists were unified in a prior change (archived as `unify-ssrf-blocklist`), but residual drift remained: `index.ts` still had a private `isAllowedHost` wrapper around `isUrlAllowedForFetch`, and no cross-path consistency test verified that the IPC validation path and the direct fetch path produce identical allow/deny results. Without such a test, future drift could re-emerge silently.

## What Changes

- Remove the redundant `isAllowedHost` wrapper in `index.ts`, replacing its call sites with direct `isUrlAllowedForFetch` calls.
- Add cross-path SSRF consistency tests in `tests/host-blocklist.test.ts` that verify both `isUrlAllowedForFetch` and the `validateIpc` IPC path agree on blocked and allowed hosts.
- Update evidence metadata to reflect the new test count (120/120).

## Capabilities

### Modified Capabilities
- `unified-ssrf-validation`: call sites now use canonical function directly; cross-path consistency test ensures no future drift.

## Impact

- `src/main/index.ts` (remove wrapper, direct call)
- `tests/host-blocklist.test.ts` (add cross-path consistency tests)
- `openspec/changes/archive/2026-07-25-unify-ssrf-blocklist/evidence/evidence.json` (update test count)
