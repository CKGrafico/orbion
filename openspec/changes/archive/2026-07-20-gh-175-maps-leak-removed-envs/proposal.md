# Bug: Main-process Maps leak entries for removed environments

## Summary

Three module-level Maps in `src/main/index.ts` and `src/main/opencode-client.ts` accumulate entries per environment but are not fully cleaned when environments are removed:

1. **`statusCache`** in `opencode-client.ts` (`Map<string, {status, at}>`) - never cleaned when environments are removed. `clearOpenCodeStatus()` exists but is only called when `setOpenCodeEndpoint` receives `null`. When `removeEnvironment` is called, the status cache entry persists. Expired entries are never evicted either - they remain in the Map forever.

2. **`streams`** (`Map<string, AbortController>`) - cleaned on stream end/error, but if an environment is removed while a stream is active for that environment, the stream entry is orphaned (the abort controller is never resolved, and the fetch connection to the remote server stays open indefinitely).

## Impact

- **Memory leak**: `statusCache` grows indefinitely. Each entry holds a full `OpenCodeConnectionStatus` object with arrays. Over weeks of uptime (Electron apps are long-lived), this becomes significant.
- **Stale data exposure**: After removing an environment and re-adding one with the same ID, a stale cached status from a previous environment could be served for 30s.
- **Active stream leak**: Removing an environment while it has an active SSE subscription leaves an orphaned `AbortController` in the `streams` Map. The fetch connection to the remote server stays open indefinitely.

## Root Cause

1. `removeEnvironment` IPC handler does NOT call `clearOpenCodeStatus()`.
2. `statusCache` has no eviction mechanism for expired entries.
3. `removeEnvironment` does not abort active streams belonging to the removed environment.
4. No `destroyAll()` function exists for `statusCache` to call on shutdown.

## Fixes

1. Add `clearOpenCodeStatus(id)` to the `config:removeEnvironment` handler.
2. Add periodic eviction sweep to `statusCache` (delete entries older than 5 minutes on every `refreshOpenCodeStatus` call).
3. Track environment ID per stream subscription; abort streams for a removed environment.
4. Add `destroyAllOpenCodeStatus()` to `opencode-client.ts`, called from `window-all-closed` handler.

## Files

- `src/main/opencode-client.ts` - statusCache eviction, destroyAllOpenCodeStatus
- `src/main/index.ts` - config:removeEnvironment handler, streamEnvironments tracking, window-all-closed
- `tests/opencode-client.test.ts` - tests for eviction and stream cleanup
