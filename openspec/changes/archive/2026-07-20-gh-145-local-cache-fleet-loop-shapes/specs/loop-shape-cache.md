# spec: LoopShapeCache

## Data model

```typescript
interface LoopShape {
  loopId: string;
  environmentId: string;
  /** The shell command (no interpolated secrets). */
  command: string;
  commandArgs: string[];
  /** Human-readable interval (e.g. "5m", "1h"). */
  intervalHuman: string;
  /** Project ID this loop belongs to. */
  projectId: string | undefined;
  /** Task ID if the loop is backed by a task chain. */
  taskId: string | null;
  /** Resolved chain steps (task name + on-success/on-failure links). */
  chainSteps: ChainStep[];
  /** Timestamp when this shape was last refreshed (Date.now()). */
  cachedAt: number;
}

interface ChainStep {
  taskId: string;
  taskName: string;
  command: string;
  commandArgs: string[];
  onSuccessTaskId: string | null;
  onFailureTaskId: string | null;
}
```

## Refresh strategy

1. **On connect**: when `seedSupervisors` runs for an environment, fetch loops + tasks and populate the cache.
2. **Opportunistically on poll**: the existing 5s loop poll already hits `/api/loops`. When the renderer receives fresh loop data, it can trigger a `loopShapeCache:refresh` call (but the main process can also refresh autonomously after a successful probe).
3. **Force-refresh**: `loopShapeCache:refresh` IPC channel accepts an optional `environmentId` to re-fetch from the daemon API.

## Persistence

The cache is written to `electron-store` under key `loopShapeCache` so it survives app restarts. On cold start, stale entries are loaded and then refreshed once the supervisor connects.

## No secrets

The `command` and `commandArgs` fields are stored as-is from the daemon API. The loop-task daemon does not include secrets in its loop/task responses (secrets live in the OS keychain). The cache never stores session tokens or SSH keys.

## Consumption

- `fleet-similarity.ts` can read cached shapes when an instance is dark (replacing `LoopMeta` with `LoopShape` for stale-but-available data).
- The pattern engine (future) can query cached shapes for cross-instance structural comparison.
- The cache service is a singleton, injected via the DI container.
