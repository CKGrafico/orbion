# Tasks: gh-145

## Task 1: Add LoopShape types and bridge interface to shared/ipc.ts
- **Agent:** frontend-engineer
- **Touches:** `src/shared/ipc.ts`
- **Depends on:** none
- **Verify:** `pnpm typecheck`

Add `LoopShape`, `ChainStep`, `LoopShapeCacheBridge` types. Add `loopShapeCache` to `LoopTaskBridge`.

## Task 2: Implement main-process loop-shape-cache module
- **Agent:** frontend-engineer
- **Touches:** `src/main/loop-shape-cache.ts` (new)
- **Depends on:** Task 1
- **Verify:** `pnpm typecheck`

Implement `LoopShapeCache` class: in-memory + electron-store persistence, `refreshForEnvironment`, `getCached`, `getAll`.

## Task 3: Wire IPC handlers and auto-refresh in main/index.ts
- **Agent:** frontend-engineer
- **Touches:** `src/main/index.ts`
- **Depends on:** Task 2
- **Verify:** `pnpm typecheck`

Add `safeHandle("loopShapeCache:getCached")` and `safeHandle("loopShapeCache:refresh")`. Hook into `seedSupervisors` and connection supervisor status changes to trigger refreshes.

## Task 4: Add preload bridge for loop-shape-cache
- **Agent:** frontend-engineer
- **Touches:** `src/preload/index.ts`
- **Depends on:** Task 1
- **Verify:** `pnpm typecheck`

Wire `loopShapeCache.getCached`, `loopShapeCache.refresh`, `loopShapeCache.onUpdate` to IPC channels.

## Task 5: Implement renderer service (interface + impl + mock + DI container)
- **Agent:** frontend-engineer
- **Touches:** `src/renderer/src/services/interfaces.ts`, `src/renderer/src/services/impl/LoopShapeCacheService.ts` (new), `src/renderer/src/services/mock/MockServices.ts`, `src/renderer/src/services/container.ts`
- **Depends on:** Task 1
- **Verify:** `pnpm typecheck`

Add `ILoopShapeCacheService`, real implementation, mock implementation, wire into DI container with `cid.ILoopShapeCacheService`.

## Task 6: Add Vitest tests for the cache logic
- **Agent:** frontend-engineer
- **Touches:** `tests/loop-shape-cache.test.ts` (new)
- **Depends on:** Task 2
- **Verify:** `pnpm vitest run tests/loop-shape-cache.test.ts`

Test: insert/overwrite shapes, freshness check, persistence round-trip (mocked store), getAll/getCached, removeEnvironment cleanup.
