## Why

When a renderer `WebContents` is destroyed while an SSE stream subscription is active, the `sender.isDestroyed()` check prevents sending events to the dead renderer, but the underlying `fetch()` + `AbortController` continues running indefinitely. The `streams` and `streamEnvironments` Maps retain entries that are never cleaned up. Over long-running desktop sessions, this causes memory leaks, orphaned TCP connections, and unbounded Map growth.

## What Changes

- In `handleStreamSubscribe()`, listen for the `WebContents` `"destroyed"` event and abort the stream + clean up Maps when the sender dies mid-stream.
- Add a defensive sweep in the `"window-all-closed"` handler to abort any stale stream entries whose `WebContents` no longer exists (belt-and-suspenders complement to the per-subscription listener).

## Capabilities

### New Capabilities
- `stream-renderer-cleanup`: Abort SSE stream subscriptions when the owning renderer `WebContents` is destroyed, cleaning up AbortController, streams Map, and streamEnvironments Map entries.

### Modified Capabilities

## Impact

- `src/main/index.ts`: `handleStreamSubscribe()` gains a `sender.once("destroyed", ...)` listener; `window-all-closed` handler gains a stale-streams sweep.
- No IPC contract changes. No renderer or preload changes.
- Existing `stream:unsubscribe` and `abortStreamsForEnvironment` cleanup paths unchanged.
