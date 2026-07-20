# Archive: Chat/InfraChat bug cluster fix

## Change ID

gh-156-chat-infra-bug-cluster

## Status

Completed

## Summary

Fixed four interrelated bugs in the chat and log viewer subsystem: wrong `finishedAt` type (`boolean | number` → `number`), no-op approval handler, `setInterval` memory leak on unmount, and log viewer flicker from unstable callback dependencies.

## What Changed

### Files Modified

- `src/renderer/src/chat/types.ts` — Changed `ChatMessage.finishedAt` type from `number | boolean | undefined` to `number | undefined`. Removed the `true` boolean fallback.
- `src/renderer/src/chat/useTranscript.ts` — Updated `isStreaming`/`isFinished` helpers to accept `number | undefined`. Changed `transcriptMessageToChatMessage` to use `tm.startedAt` instead of `true` as the numeric fallback for legacy persisted data.
- `src/renderer/src/components/InfraChatPanel.tsx` — Implemented `handleResolveApproval` to call `resolveApproval()` and `finishTurn()`. Added `streamIntervalRef` to store the `setInterval` reference; added `useEffect` cleanup on unmount; cleared interval in `handleInterrupt`.
- `src/renderer/src/components/useLogRows.ts` — Added `expandedRunsRef` (`useRef<Set<number>>`) to track expanded runs without depending on `segments` state. Removed `segments` from `rebuildSegments`' dependency array (`[segments]` → `[]`). Synced the ref in `toggleSegment`, `appendLines`, `appendEvent`, `setInitialRows`, and `reset`.

### Behavioral Changes

| Before | After |
|--------|-------|
| `ChatMessage.finishedAt` accepted `boolean` values; `true` was used as a legacy fallback | `finishedAt` is always `number | undefined`; legacy `true` converted to numeric timestamp |
| Clicking Approve/Decline in InfraChatPanel had no effect | Approval buttons resolve the approval and finish the turn |
| Component unmount during streaming chat caused React state update on unmounted component warning | `setInterval` is stored in ref and cleared on unmount and interrupt |
| Every streaming log line changed `rebuildSegments` identity, cascading to all downstream callbacks and causing log viewer flicker | `rebuildSegments` has `[]` deps; `appendLines`/`appendEvent` have stable identities across segment changes |

### New Files

- `src/visual-evidence/scenarios/gh-156-chat-infra-bug-cluster.ts` — Playwright scenario for automated visual evidence
- `openspec/changes/gh-156-chat-infra-bug-cluster/proposal.md` — OpenSpec proposal
- `openspec/changes/gh-156-chat-infra-bug-cluster/tasks.md` — OpenSpec tasks
- `openspec/changes/gh-156-chat-infra-bug-cluster/evidence/` — Visual evidence assets

### No New

- No new IPC channels
- No new UI components
- No new services or interfaces
- No changes to mock adapter or main process

## Verification

- `pnpm typecheck` passes (no new errors introduced)
- Visual evidence scenario passed (3/3 assertions)
- All existing scenarios continue to pass
