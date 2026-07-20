# Proposal: Chat/InfraChat bug cluster fix

## Change ID

gh-156-chat-infra-bug-cluster

## Summary

Four interrelated bugs in the chat and log viewer subsystem: wrong `finishedAt` type, no-op approval handlers, memory leak from uncleaned `setInterval`, and log viewer flicker from unstable callback dependencies.

## Problem

1. **finishedAt typed as boolean but used as number** — `ChatMessage.finishedAt` is `number | boolean` but `Date.now()` (number) is always assigned. The loose type allows `true` which is incorrect for a timestamp field.

2. **Approval handler is a no-op** — `handleResolveApproval` in `InfraChatPanel.tsx` only checks `activeTurnId` and returns. Users clicking Approve/Decline see no effect.

3. **setInterval never cleaned up on unmount** — A `setInterval` created inside `handleSendPrompt` is never stored for cleanup. Component unmount during streaming triggers state update on unmounted component — memory leak and potential crash.

4. **LogViewer flickers on every streaming line** — `rebuildSegments` depends on `segments` in its dependency array, causing it (and all callbacks that depend on it) to get new identities on every log line append. Effects re-run on every streaming line.

## Solution

### Approach

1. **Bug 1**: Change `finishedAt` type from `number | boolean` to `number` in `ChatMessage`. Update `transcriptMessageToChatMessage` to use `tm.startedAt` instead of `true` for legacy fallback. Update `isStreaming`/`isFinished` helpers.

2. **Bug 2**: Implement `handleResolveApproval` to find the matching turn, call `resolveApproval(turnId, decision)`, call `finishTurn(turnId)`, and reset `activeTurnId`.

3. **Bug 3**: Store `setInterval` reference in `useRef`. Add `useEffect` cleanup to clear interval on unmount. Clear interval in `handleInterrupt`.

4. **Bug 4**: Replace `segments` state dependency in `rebuildSegments` with `expandedRunsRef` (a `useRef<Set<number>>`). Sync the ref in `toggleSegment`, `appendLines`, `appendEvent`, `setInitialRows`, and `reset`. This makes `rebuildSegments` identity-stable, stabilizing all downstream callbacks.

### Scope

- **Files changed**: `src/renderer/src/chat/types.ts`, `src/renderer/src/chat/useTranscript.ts`, `src/renderer/src/components/InfraChatPanel.tsx`, `src/renderer/src/components/useLogRows.ts`
- **No new IPC channels, no new UI components, no new services**

## Acceptance Criteria

- [ ] `ChatMessage.finishedAt` is typed as `number | undefined`, not `number | boolean | undefined`
- [ ] `handleResolveApproval` calls `resolveApproval()` and `finishTurn()` when a user clicks Approve/Decline
- [ ] `setInterval` reference is stored in `useRef` and cleaned up on unmount and interrupt
- [ ] `rebuildSegments` has `[]` as dependency array (no `segments` dependency)
- [ ] `appendLines` and `appendEvent` have stable identities across segment state changes
- [ ] `pnpm typecheck` passes
