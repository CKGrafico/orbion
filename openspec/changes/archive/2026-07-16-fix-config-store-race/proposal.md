# Fix Race Condition in Config-Store: Serialize Concurrent IPC Writes

## Problem

`src/main/config-store.ts` uses a read-modify-write pattern everywhere (e.g. `getEnvironments()` → mutate array → `store.set("environments", envs)`), but multiple IPC handlers can fire concurrently from the renderer. When two rapid mutations overlap (e.g. adding an environment while removing another), the second write overwrites the first because both read the same snapshot before either commits. This causes **silent data loss** — environments disappearing without any error.

## Root Cause

Every mutating function does:
1. `store.get("environments")` — reads a snapshot
2. Mutate the in-memory array
3. `store.set("environments", envs)` — writes back

Between step 1 and step 3, another concurrent IPC handler can read the **same** snapshot, make its own mutation, and write back — overwriting the first mutation.

## Solution

Introduce a `serialize()` wrapper that chains all mutations through a single Promise queue. Each mutating function is wrapped so that its read-modify-write cycle runs exclusively — no two mutations can overlap.

```typescript
let writeChain: Promise<void> = Promise.resolve();

function serialize<T>(fn: () => T): Promise<T> {
  const next = writeChain.then(() => fn());
  writeChain = next.catch(() => {});
  return next;
}
```

Every function that does `store.set(...)` after reading state is wrapped with `serialize()`. Since `serialize` returns a Promise, synchronous callers in `index.ts` (via `ipcMain.handle`) are unaffected — `ipcMain.handle` already returns Promises.

## Affected Functions (all wrapped with `serialize()`)

- `addEnvironment()`
- `removeEnvironment()`
- `addEndpoint()`
- `removeEndpoint()`
- `setActiveEndpoint()`
- `setEnvironmentFingerprintId()`
- `setEnvironmentAuthState()`
- `setMainVm()`
- `autoPromoteFirstEnvIfNeeded()`
- `updateEndpointHealth()`
- `setOpenCodeEndpoint()`
- `setInfraOpenCodeEndpoint()`
- `storeSessionToken()`
- `removeSessionToken()`
- `migrateFromLocalStorage()`
- `setSelectedEnvironmentId()`
- `ensureMigrated()` (internal, called from reads, must also be serialized)

## Scope

- **Single file change:** `src/main/config-store.ts` only
- No changes to `index.ts`, IPC handlers, or the renderer
- Return types change from `T` to `Promise<T>` for mutating functions — all callers already use `ipcMain.handle` (async), so this is compatible

## Severity

8/10 — Silent data loss is the worst class of bug for a config store.
