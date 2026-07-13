# Spec — Config Store IPC

## Channels

| Channel | Direction | Args | Returns |
|---|---|---|---|
| `config:getInstances` | renderer→main | none | `Instance[]` |
| `config:addInstance` | renderer→main | `name: string, baseUrl: string` | `Instance` |
| `config:removeInstance` | renderer→main | `id: string` | `void` |
| `config:getSelectedInstanceId` | renderer→main | none | `string \| null` |
| `config:setSelectedInstanceId` | renderer→main | `id: string \| null` | `void` |
| `config:migrateFromLocalStorage` | renderer→main | `rawInstances: string, rawSelectedId: string \| null` | `boolean` |

## Types

`Instance` is `{ id: string; name: string; baseUrl: string }` — shared via `src/shared/ipc.ts`.

## Bridge

`ConfigBridge` interface is a sub-property of `LoopTaskBridge` at `window.api.config`.

## SafeStorage

`encryptValue` / `decryptValue` exported from `config-store.ts`. Not exposed over IPC — main-process only.
