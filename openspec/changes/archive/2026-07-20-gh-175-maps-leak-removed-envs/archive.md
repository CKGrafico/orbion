# Archive: gh-175-maps-leak-removed-envs

## What Changed

Fixed three memory leaks in the main process that caused Maps to accumulate entries for removed environments:

1. **statusCache leak** (`opencode-client.ts`): Added `clearOpenCodeStatus(id)` call in the `config:removeEnvironment` handler. Added `evictExpiredStatusCache()` that runs on every `refreshOpenCodeStatus` call, deleting entries older than 5 minutes.

2. **Orphaned streams** (`index.ts`): Added `streamEnvironments` Map to track which environment owns each stream subscription. Added `abortStreamsForEnvironment(id)` function that aborts and cleans up all streams for a removed environment. Called from the `config:removeEnvironment` handler.

3. **Shutdown cleanup** (`opencode-client.ts` + `index.ts`): Added `destroyAllOpenCodeStatus()` function, called from the `window-all-closed` handler alongside existing cleanup.

## Verification

- `pnpm typecheck` passes
- 10 new tests in `tests/opencode-client.test.ts` covering eviction, clearing, and stream cleanup

## Evidence

This change is internal (main-process memory management) with no user-visible behavior. Visual evidence is not required.
