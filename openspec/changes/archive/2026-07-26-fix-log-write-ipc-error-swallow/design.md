## Context

The preload bridge's `log.write` uses `void ipcRenderer.invoke("log:write", entry)` to fire-and-forget. The main-process handler can reject (rate-limit `IpcValidationError`, input validation failure). Discarding the promise with `void` causes unhandled-promise-rejection events in Electron.

## Goals / Non-Goals

**Goals:**
- Prevent unhandled-promise-rejection noise from `log:write` IPC calls
- Document the fire-and-forget intent explicitly

**Non-Goals:**
- Changing `LogBridge.write` return type from `void`
- Adding retry or backoff logic for rate-limited logs
- Exposing rejection details to renderer callers

## Decisions

1. **Use `.catch(() => {})` instead of returning the promise**
   - The `LogBridge` type contract is `void` return. Callers don't await.
   - Returning the promise would change the effective API (even if type stays `void`, callers could capture the return).
   - `.catch(() => {})` is explicit: documents intent, prevents unhandled rejection, minimal change.

## Risks / Trade-offs

- **Risk**: Renderers lose visibility into rate-limit hits → Acceptable: log flooding is the bigger problem; the rate limit exists for a reason.
