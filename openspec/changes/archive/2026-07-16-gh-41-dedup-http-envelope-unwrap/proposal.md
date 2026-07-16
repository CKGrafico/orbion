# Change: Duplicated SSE/HTTP envelope unwrapping logic ×4 — extract shared utility

**Issue:** #41
**Severity:** 7/10 — Architectural debt risking correctness

## Problem

The "fetch → check HTTP status → try JSON parse → check `{ok, data, error}` envelope → return structured result" pattern is copy-pasted **4 times** across the main process with subtle differences in error handling. This is a DRY violation that makes bug fixes error-prone — a fix in one copy must be replicated to all others, and the diverging edge-case handling is almost certainly unintentional.

### Duplicated Locations

1. `src/main/index.ts` `handleApiRequest()` (lines 154-213) — Full implementation with timeout, auth headers, 401 handling, envelope unwrapping
2. `src/main/connection-supervisor.ts` `makeProbe()` (lines 294-353) — Simpler version, no auth headers, probe timeout, same envelope check but different error message keys
3. `src/main/connection-supervisor.ts` `fetchFingerprint()` (lines 365-388) — Different JSON shape check (`"id" in data && "label" in data`), different error handling
4. `src/main/config-store.ts` `exchangePairingCode()` (lines 439-484) — Different envelope shape (`{accessToken, scope?}`), separate error text handling

### Bonus Duplications

- `compareSemver()` is identical in `ssh-probe.ts` (lines 8-17) and `opencode-client.ts` (lines 28-37)
- `trimTrailingSlash` pattern `.replace(/\/+$/, "")` appears **11 times** across 4 files

## Proposed Solution

1. Create `src/main/http-utils.ts` with a configurable `fetchAndUnwrap<T>()` utility supporting all 4 use cases
2. Create `src/shared/utils.ts` with `compareSemver()` and `trimTrailingSlash()`
3. Refactor all call sites to use the shared utilities

The `fetchAndUnwrap` utility will be flexible enough to handle:
- Standard `{ok, data, error}` envelope unwrapping (cases 1 & 2)
- Raw JSON shape validation (case 3 — fingerprint)
- Custom response shape unwrapping (case 4 — pairing code)
- Optional 401 handling callback
- Configurable timeout, method, headers, body

## Files Changed

- `src/main/http-utils.ts` — NEW: shared HTTP utility
- `src/shared/utils.ts` — NEW: shared pure utilities
- `src/main/index.ts` — refactor `handleApiRequest` and `joinUrl` to use shared utilities
- `src/main/connection-supervisor.ts` — refactor `makeProbe` and `fetchFingerprint`
- `src/main/config-store.ts` — refactor `exchangePairingCode`
- `src/main/ssh-probe.ts` — import shared `compareSemver`
- `src/main/opencode-client.ts` — import shared `compareSemver` and `trimTrailingSlash`
- `src/renderer/src/store.ts` — import shared `trimTrailingSlash`
