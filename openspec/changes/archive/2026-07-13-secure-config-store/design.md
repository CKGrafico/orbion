# Design — Secure Config Store

## Architecture

One new module in `src/main/config-store.ts` backed by `electron-store` with a typed schema:

```typescript
interface ConfigSchema {
  instances: Instance[];
  selectedInstanceId: string | null;
}
```

The renderer accesses config exclusively through IPC channels registered in `src/main/index.ts`:

- `config:getInstances` → `Instance[]`
- `config:addInstance(name, baseUrl)` → `Instance`
- `config:removeInstance(id)` → `void`
- `config:getSelectedInstanceId` → `string | null`
- `config:setSelectedInstanceId(id)` → `void`
- `config:migrateFromLocalStorage(rawInstances, rawSelectedId)` → `boolean`

The `ConfigBridge` interface in `src/shared/ipc.ts` types these channels for the preload/renderer.

## SafeStorage wrapper

`encryptValue(plaintext)` / `decryptValue(encryptedBase64)` wrap Electron's `safeStorage` API. They return `null` if encryption is unavailable or decryption fails. No call sites use them yet — the capability is ready for future secrets.

## Migration

On first launch with the new code, the renderer's `store.ts` detects the old `lta.instances.v1` localStorage key, calls `migrateFromLocalStorage` to write data into electron-store, then clears the localStorage keys. This is a one-time operation.

## Mock mode

When `window.api` is absent (browser-only dev), `store.ts` falls back to `localStorage` for persistence, preserving the existing mock-mode workflow.
