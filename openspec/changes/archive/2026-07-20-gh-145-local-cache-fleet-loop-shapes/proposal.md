# gh-145: Local cache of fleet loop shapes

**Issue:** #145
**Status:** In Progress
**Branch:** feat/gh-145-local-cache-fleet-loop-shapes

## Problem

When some instances are dark (unreachable), the fleet-similarity and pattern-suggestion features have no data to work from. Pattern suggestions are slow because they must query each instance's API on demand. There is no local store of loop/chain structural shapes that survives instance outages.

## Solution

Add a lightweight local cache of loop + chain structures per instance. On connect and periodically (when the loop list is already polled), the cache extracts and stores the structural shape of each loop: its command, chain order (task + on-success/on-failure task IDs and names), interval, and projectId. No secrets are cached. Each entry carries a freshness timestamp and is refreshed opportunistically (piggybacked on the existing 5s loop poll).

This is purely invisible plumbing with no UI surface. The cache is consumed by fleet-similarity.ts and the pattern engine (future) for fast, offline-capable lookups.

## Architecture

- **Main process module** (`src/main/loop-shape-cache.ts`): pure in-memory cache keyed by `environmentId`. Stores `LoopShape` entries extracted from `/api/loops` and `/api/tasks` responses. Refreshed when `seedSupervisors` runs and on each successful loop poll. Persisted to `electron-store` for cold-start recovery.

- **IPC channels**: `loopShapeCache:getCached`, `loopShapeCache:refresh` (force-refresh for a single environment).

- **Renderer service** (`ILoopShapeCacheService`): injectable service that reads from the IPC bridge. Mock counterpart for dev:web mode.

## Files touched

- `src/shared/ipc.ts` (types + bridge interface)
- `src/main/loop-shape-cache.ts` (new)
- `src/main/index.ts` (IPC handlers + refresh hook)
- `src/preload/index.ts` (bridge wiring)
- `src/renderer/src/services/interfaces.ts` (ILoopShapeCacheService)
- `src/renderer/src/services/impl/LoopShapeCacheService.ts` (new)
- `src/renderer/src/services/mock/MockServices.ts` (mock)
- `src/renderer/src/services/container.ts` (DI wiring)
- `tests/loop-shape-cache.test.ts` (new)
