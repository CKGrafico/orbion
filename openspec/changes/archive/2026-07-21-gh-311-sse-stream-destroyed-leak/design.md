## Context

The main process `handleStreamSubscribe()` in `src/main/index.ts` manages SSE stream subscriptions in two Maps: `streams` (subId → AbortController) and `streamEnvironments` (subId → environmentId). When a renderer `WebContents` is destroyed mid-stream, the `send()` helper silently drops events via `sender.isDestroyed()`, but the `fetch()` call continues until the stream ends naturally or errors. No cleanup path exists for renderer-death scenarios.

Current cleanup paths:
- `stream:unsubscribe` IPC handler: explicit unsubscribe from renderer.
- `abortStreamsForEnvironment()`: called when an environment is removed.
- `window-all-closed` handler: aborts all streams when all windows close.
- `finally` block in `handleStreamSubscribe`: cleanup after stream ends/errors.

Missing: cleanup when the renderer dies without sending an unsubscribe.

## Goals / Non-Goals

**Goals:**
- Abort SSE stream fetch and clean up Maps when the owning WebContents is destroyed.
- Provide a defensive sweep for stale entries that might escape the per-subscription listener.

**Non-Goals:**
- Changing the IPC contract or adding new IPC channels.
- Modifying renderer or preload code.
- Changing the existing `stream:unsubscribe` or `abortStreamsForEnvironment` cleanup paths.

## Decisions

### 1. Use `sender.once("destroyed")` listener per subscription

Register `sender.once("destroyed", ...)` immediately after creating the AbortController and adding it to the Maps. When the event fires, abort the controller and delete both Map entries. The `finally` block in the async function will also run (triggered by the AbortError), but the Map deletions are idempotent.

Rationale: colocates cleanup with the subscription lifecycle. The `once` listener auto-removes after firing, no manual cleanup needed.

Alternative considered: polling sweep only. Rejected because it adds latency between renderer death and cleanup.

### 2. Track sender references per stream for defensive sweep

Store `sender` alongside the AbortController to enable a defensive sweep in `window-all-closed`. Change `streams` from `Map<string, AbortController>` to `Map<string, { controller: AbortController; sender: Electron.WebContents }>`.

Rationale: the sweep needs to know which WebContents owns each stream to detect orphans. The existing `window-all-closed` already aborts all streams, so the sweep only adds value during partial renderer death scenarios (e.g., multi-window). Storing the sender reference is cheap and enables targeted cleanup.

Alternative considered: keep `streams` as-is and only rely on the `destroyed` listener. Rejected because it doesn't cover edge cases where the listener might not fire (e.g., process crash without event emission).

### 3. Defensive sweep in `window-all-closed` already covers all streams

The existing `window-all-closed` handler already aborts all streams and clears both Maps. The added `sender.once("destroyed")` listener provides per-subscription granularity. No additional periodic sweep is needed because the two mechanisms together cover all scenarios.

## Risks / Trade-offs

- [Double deletion risk] The `destroyed` listener and the `finally` block both delete from the Maps. Idempotent `Map.delete()` makes this safe.
- [Sender ref retains WebContents] Storing sender in the Map could theoretically prevent GC. Mitigated because the ref is cleared on cleanup (destroyed/unsubscribe/finally), and `AbortController` holds no strong ref to sender.
- [Race condition] If `destroyed` fires after `finally` already ran, `Map.delete` is a no-op and `controller.abort()` on an already-aborted controller is safe (spec guarantees idempotency).
