# Spec: Config-Store Write Serialization

## Mechanism

### serialize() helper

A module-level Promise chain ensures only one mutation executes at a time:

```typescript
let writeChain: Promise<void> = Promise.resolve();

function serialize<T>(fn: () => T): Promise<T> {
  const next = writeChain.then(() => fn());
  writeChain = next.catch(() => {}); // keep chain alive on rejection
  return next;
}
```

- `writeChain` is never rejected (caught with empty handler) so the chain never breaks.
- Each call appends to the chain and returns the result via the intermediate promise.
- Errors propagate to the caller via the returned promise; the chain continues regardless.

### Function signature changes

All mutating functions change from synchronous `T` to async `Promise<T>`:

| Before | After |
|--------|-------|
| `addEnvironment(...): Environment` | `addEnvironment(...): Promise<Environment>` |
| `removeEnvironment(...): void` | `removeEnvironment(...): Promise<void>` |
| `addEndpoint(...): AccessEndpoint \| null` | `addEndpoint(...): Promise<AccessEndpoint \| null>` |
| `removeEndpoint(...): void` | `removeEndpoint(...): Promise<void>` |
| `setActiveEndpoint(...): void` | `setActiveEndpoint(...): Promise<void>` |
| `setEnvironmentFingerprintId(...): void` | `setEnvironmentFingerprintId(...): Promise<void>` |
| `setEnvironmentAuthState(...): void` | `setEnvironmentAuthState(...): Promise<void>` |
| `setMainVm(...): void` | `setMainVm(...): Promise<void>` |
| `autoPromoteFirstEnvIfNeeded(): void` | `autoPromoteFirstEnvIfNeeded(): Promise<void>` |
| `updateEndpointHealth(...): void` | `updateEndpointHealth(...): Promise<void>` |
| `setOpenCodeEndpoint(...): void` | `setOpenCodeEndpoint(...): Promise<void>` |
| `setInfraOpenCodeEndpoint(...): void` | `setInfraOpenCodeEndpoint(...): Promise<void>` |
| `storeSessionToken(...): boolean` | `storeSessionToken(...): Promise<boolean>` |
| `removeSessionToken(...): void` | `removeSessionToken(...): Promise<void>` |
| `migrateFromLocalStorage(...): boolean` | `migrateFromLocalStorage(...): Promise<boolean>` |
| `setSelectedEnvironmentId(...): void` | `setSelectedEnvironmentId(...): Promise<void>` |

### Internal: ensureMigrated()

`ensureMigrated()` is called at the top of read functions like `getEnvironments()`. It also does `store.set(...)`. It must be serialized too:

```typescript
function ensureMigrated(): Promise<void> {
  return serialize(() => {
    if (store.get("instancesMigrated", false)) return;
    // ... migration logic
    store.set("instancesMigrated", true);
  });
}
```

However, since `ensureMigrated()` is called from `getEnvironments()` and other read functions that are NOT serialized, we need to handle the interaction. The read functions call `ensureMigrated()` and then read — if `ensureMigrated` is async, the read must await it.

**Decision:** Make `ensureMigrated()` return `Promise<void>` and have all read functions that call it become async too. The read functions (`getEnvironments`, `findEnvironmentByFingerprint`, `getSessionToken`, `getMainVmId`, `getMainVm`) will also become async.

This impacts callers in `index.ts` — but since all callers are inside `ipcMain.handle` (which is async), this is safe.

### Callers in connection-supervisor.ts and opencode-client.ts

- `connection-supervisor.ts` imports: `getSessionToken`, `setEnvironmentAuthState`, `removeSessionToken`
- `opencode-client.ts` imports: `decryptValue` (not affected — read-only, no store access)
- `vm-wizard.ts` imports: `getEnvironments`, `addEnvironment`, `exchangePairingCode`, `storeSessionToken`, `setOpenCodeEndpoint`, `autoPromoteFirstEnvIfNeeded`

All these callers use the functions in async contexts. The return type changes are compatible.

### seedSupervisors() in index.ts

Calls `getEnvironments()` synchronously in `seedSupervisors()`. This must be updated to await since `getEnvironments()` becomes async. The call in `seedSupervisors()` and any other synchronous call sites in `index.ts` must be updated.

## Invariants

1. **No two config-store mutations execute concurrently** — guaranteed by the Promise chain.
2. **Reads see consistent state** — `ensureMigrated()` is serialized, so reads after migration see the migrated data.
3. **Errors don't break the chain** — `writeChain` always resolves, errors propagate only to the caller.
4. **IPC compatibility** — all `ipcMain.handle` callbacks already return Promises; async functions are a drop-in replacement.
