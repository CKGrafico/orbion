## Context

Two SSRF modules with diverging host lists. `ssrf-allowlist.ts` (runtime path) lacks Azure metadata DNS entries present in `ssrf-blocklist.ts` (IPC validation path). This is a security gap — Azure IMDS exfiltration possible via `api:request` or `stream:subscribe` channels.

Current state:
- `ssrf-allowlist.ts`: exports `isUrlAllowedForFetch`, uses `CLOUD_METADATA_DNS_HOSTS` (Google only)
- `ssrf-blocklist.ts`: exports `isHostAllowed`, `isUrlAllowedForFetch`, `isAllowedBaseUrl`, uses `CLOUD_METADATA_HOSTNAMES` (Google + Azure) and `CLOUD_METADATA_IPS`
- `ipc-validation.ts` imports `isAllowedBaseUrl` from `ssrf-blocklist.ts`
- `index.ts` imports `isUrlAllowedForFetch` from `ssrf-allowlist.ts`

## Goals / Non-Goals

**Goals:**
- Eliminate the security gap: block Azure metadata DNS in the runtime SSRF check
- Eliminate the duplicate module: single source of truth in `ssrf-allowlist.ts`
- Ensure both call paths (IPC validation and runtime) produce identical results for all blocked hosts

**Non-Goals:**
- Adding new cloud providers beyond what the blocklist already covers (GCP + Azure)
- Changing the `allowLoopback` option semantics
- Restructuring the IPC validation layer

## Decisions

### D1: Consolidate into `ssrf-allowlist.ts`, delete `ssrf-blocklist.ts`

**Choice:** Move all SSRF logic into `ssrf-allowlist.ts`. Delete `ssrf-blocklist.ts`.

**Rationale:** The `unified-ssrf-validation` spec already mandates that `ssrf-allowlist.ts` be the single canonical module. The blocklist is the legacy artifact that was supposed to be removed but still exists. Keeping one module eliminates drift risk permanently.

**Alternative:** Add Azure hosts to allowlist, keep blocklist. Rejected — drift will recur (two lists to keep in sync, no compile-time enforcement).

### D2: Merge `isHostAllowed` and `isAllowedBaseUrl` into `ssrf-allowlist.ts`

**Choice:** Move the `isHostAllowed` and `isAllowedBaseUrl` functions from `ssrf-blocklist.ts` into `ssrf-allowlist.ts`. They become thin wrappers over the existing `isUrlAllowedForFetch` (which already does the real work).

**Rationale:** `ipc-validation.ts` needs `isAllowedBaseUrl`. Rather than duplicate the logic, move the function to the canonical module. `isHostAllowed` is the hostname-only check that `isUrlAllowedForFetch` uses internally — but currently the allowlist implements checks inline. Refactor: extract `isHostAllowed` as the core predicate, have `isUrlAllowedForFetch` delegate to it.

### D3: Expand `CLOUD_METADATA_DNS_HOSTS` to include Azure

**Choice:** Add `metadata.azure.internal` and `metadata.azure.internal.` to `CLOUD_METADATA_DNS_HOSTS` in `ssrf-allowlist.ts`.

**Rationale:** Direct fix for the security gap. Matches the entries already present in the blocklist.

## Risks / Trade-offs

- **[Risk]** Breaking `ipc-validation.ts` if import path changes and the re-export signatures differ → **Mitigation:** `isAllowedBaseUrl` is re-exported from `ssrf-allowlist.ts` with identical signature. Typechecked at compile time.
- **[Risk]** Removing `ssrf-blocklist.ts` could break any unknown consumers → **Mitigation:** Grep confirmed only `ipc-validation.ts` imports from it. Test suite covers both paths.
