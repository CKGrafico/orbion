# Tasks: Chat/InfraChat bug cluster fix

## Task 1: Fix finishedAt type from boolean to number

**Tier**: 1  
**Touches**: `src/renderer/src/chat/types.ts`, `src/renderer/src/chat/useTranscript.ts`  
**Depends on**: —

### What

1. In `types.ts`, change `ChatMessage.finishedAt` from `number | boolean | undefined` to `number | undefined`.
2. In `useTranscript.ts`, update `isStreaming` and `isFinished` helpers to accept `number | undefined` instead of `number | boolean | undefined`.
3. In `transcriptMessageToChatMessage`, change the `true` fallback to `tm.startedAt` (use the message timestamp as a proxy finish time for legacy data).

### Verification

- `pnpm typecheck` passes
- No runtime behavior change for existing code that assigns `Date.now()` to `finishedAt`

---

## Task 2: Implement handleResolveApproval

**Tier**: 1  
**Touches**: `src/renderer/src/components/InfraChatPanel.tsx`  
**Depends on**: —

### What

Replace the no-op `handleResolveApproval` with a working implementation that:
1. Finds the turn containing the approval by matching `approvalId`.
2. Calls `resolveApproval(turnId, decision)`.
3. Calls `finishTurn(turnId)`.
4. Resets `activeTurnId` to null.

### Verification

- `pnpm typecheck` passes
- Approval/Decline buttons in chat update the turn state

---

## Task 3: Fix setInterval memory leak

**Tier**: 1  
**Touches**: `src/renderer/src/components/InfraChatPanel.tsx`  
**Depends on**: —

### What

1. Add `streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)`.
2. Store the interval reference from `handleSendPrompt` into `streamIntervalRef`.
3. Clear `streamIntervalRef.current` when the interval completes naturally.
4. Add a `useEffect` cleanup that clears `streamIntervalRef` on unmount.
5. Clear `streamIntervalRef` in `handleInterrupt`.

### Verification

- `pnpm typecheck` passes
- No state update on unmounted component warning when navigating away during streaming

---

## Task 4: Fix LogViewer flicker by stabilizing callback identities

**Tier**: 2  
**Touches**: `src/renderer/src/components/useLogRows.ts`  
**Depends on**: —

### What

1. Add `expandedRunsRef = useRef<Set<number>>(new Set())` to track expanded run numbers.
2. Refactor `rebuildSegments` to read from `expandedRunsRef.current` instead of the `segments` state closure. Change dependency array from `[segments]` to `[]`.
3. Sync `expandedRunsRef` in every place that updates segments:
   - `toggleSegment`: update ref from new segment state.
   - `appendLines`: update ref after calling `rebuildSegments`.
   - `appendEvent`: update ref after calling `rebuildSegments`.
   - `setInitialRows`: update ref after rebuilding segments.
   - `reset`: clear the ref.

### Verification

- `pnpm typecheck` passes
- `appendLines` and `appendEvent` maintain stable reference identities across log line appends
- Log viewer no longer flickers or reloads during streaming
