## Why

Two SSRF protection modules implement the same check with different host lists. `ssrf-blocklist.ts` includes Azure metadata DNS hostnames (`metadata.azure.internal`, `metadata.azure.internal.`) but `ssrf-allowlist.ts` does not. The runtime SSRF check in `isUrlAllowedForFetch` (from allowlist) therefore allows requests to Azure IMDS endpoints — a security vulnerability with severity 8/10. Issue #357.

## What Changes

- Add Azure metadata DNS hostnames (`metadata.azure.internal`, `metadata.azure.internal.`) to `CLOUD_METADATA_DNS_HOSTS` in `ssrf-allowlist.ts`
- Delete `ssrf-blocklist.ts` and make `ssrf-allowlist.ts` the single source of truth
- Re-export `isHostAllowed` and `isAllowedBaseUrl` from `ssrf-allowlist.ts` (consumers of blocklist still need these)
- Update `ipc-validation.ts` import from `ssrf-blocklist.js` to `ssrf-allowlist.js`
- Add `isAllowedBaseUrl` and `isHostAllowed` functions to `ssrf-allowlist.ts` (moved from blocklist)
- Add Azure metadata test cases to `tests/host-blocklist.test.ts`
- Add cross-path consistency test for Azure metadata hostnames

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `unified-ssrf-validation`: extend to cover Azure metadata DNS hostnames; delete `ssrf-blocklist.ts`; consolidate all SSRF logic into `ssrf-allowlist.ts`
- `host-blocklist`: extend cloud metadata DNS hostname requirement to include Azure (`metadata.azure.internal`, `metadata.azure.internal.`)

## Impact

- `src/main/ssrf-allowlist.ts` — add Azure DNS hosts, add `isHostAllowed` and `isAllowedBaseUrl` exports
- `src/main/ssrf-blocklist.ts` — deleted
- `src/main/ipc-validation.ts` — import from `ssrf-allowlist.js` instead of `ssrf-blocklist.js`
- `tests/host-blocklist.test.ts` — add Azure metadata test cases
