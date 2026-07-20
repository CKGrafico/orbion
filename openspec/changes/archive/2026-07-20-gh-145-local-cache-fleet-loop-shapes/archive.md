# Archive: Local cache of fleet loop shapes

## Change ID
gh-145-local-cache-fleet-loop-shapes

## GitHub Issue
#145

## Status
Completed

## Summary
Implemented a lightweight local cache of loop + chain shapes per instance. On connect and periodically, loop and task structures are cached locally (commands, chain order, intervals - no secrets) with freshness timestamps, refreshed opportunistically when supervisors connect. Purely invisible plumbing with no UI surface.

## Files Changed
- `src/shared/ipc.ts` - Added `LoopShape`, `ChainStep`, `LoopShapeCacheBridge` types and `loopShapeCache` to `LoopTaskBridge`
- `src/main/loop-shape-cache.ts` (NEW) - Main process cache module: in-memory + electron-store persistence, `refreshForEnvironment`, `getCached`, `getAllCached`, `removeEnvironmentShapes`, `onCacheUpdate`
- `src/main/index.ts` - Added IPC handlers `loopShapeCache:getCached`, `loopShapeCache:getAll`, `loopShapeCache:refresh`; hooked cache init on startup; cache refresh on `seedSupervisors`; cache cleanup on environment removal; push updates to renderer
- `src/preload/index.ts` - Wired `loopShapeCache` bridge methods to IPC channels
- `src/renderer/src/services/interfaces.ts` - Added `ILoopShapeCacheService` interface
- `src/renderer/src/services/impl/LoopShapeCacheService.ts` (NEW) - Real implementation via `window.api`
- `src/renderer/src/services/mock/MockServices.ts` - Added `MockLoopShapeCacheService` with mock shapes derived from existing mock loops/tasks
- `src/renderer/src/services/container.ts` - Registered real and mock singleton in DI container
- `tests/loop-shape-cache.test.ts` (NEW) - 5 Vitest unit tests for chain-building logic and data integrity

## Acceptance Criteria
- ✅ On connect, loop + chain structures per instance are cached locally (commands, chain order, intervals - no secrets)
- ✅ Cache entries have freshness timestamps (`cachedAt`) and are refreshed opportunistically on supervisor connect
- ✅ Purely invisible plumbing; no UI surface
- ✅ Cache persists to electron-store for cold-start recovery
- ✅ Cache entries removed when environments are removed
- ✅ Mock adapter counterpart for dev:web mode

## Tests
5 Vitest unit tests covering chain-building logic (linear chains, cycle detection, missing tasks) and LoopShape data integrity - all passing.

## Evidence
This change is purely invisible plumbing with no user-visible behavior, so no visual evidence is required.
