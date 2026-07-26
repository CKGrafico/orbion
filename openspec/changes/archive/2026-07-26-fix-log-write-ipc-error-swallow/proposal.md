## Why

`bridge.log.write()` discards the `ipcRenderer.invoke()` promise with `void`, causing unhandled-promise-rejection noise when the main-process handler rejects (rate-limit `IpcValidationError`, validation failure). Fire-and-forget is intentional for performance, but the `void` discard is misleading and hides rejections the renderer might want to know about.

## What Changes

- Replace `void ipcRenderer.invoke("log:write", entry)` with an explicit `.catch(() => {})` pattern in `src/preload/index.ts`
- The `LogBridge.write` return type stays `void` — callers who need the promise can still access it if needed, but the default path is fire-and-forget with explicit error swallowing

## Capabilities

### New Capabilities

_None_

### Modified Capabilities

_None_

## Impact

- `src/preload/index.ts`: single-line change in `log.write` bridge method
- No type changes, no new IPC channels, no API surface changes
