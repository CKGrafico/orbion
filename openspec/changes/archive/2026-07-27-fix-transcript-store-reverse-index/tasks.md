# Tasks: Fix transcript-store findSessionForMessage O(n*m) scan

## Task 1: Add messageId→sessionId reverse index to transcript-store
- **agent**: fullstack-engineer
- **tier**: fast
- **depends_on**: none
- **touches**: src/main/transcript-store.ts
- **done**: false

Add `const messageIndex = new Map<string, string>()` at module level.

Update `appendMessage`: after writing, add `messageIndex.set(withTimestamp.id, message.sessionId)`.
Update `appendMessages`: after writing, add each `withTimestamp.id → sessionId` entry.
Update `deleteSession`: before deleting, read messages, remove each `message.id` from `messageIndex`, then delete the session file.
Update `updateMessageInSession`: after finding the message in session, set `messageIndex.set(messageId, sessionId)`.
Update `findSessionForMessage`: check `messageIndex.get(messageId)` first. On miss, fall back to directory scan. After scanning a file, index ALL its messages (not just the target) so subsequent lookups are O(1). Return the sessionId.

## Task 2: Run typecheck, test, build verification
- **agent**: fullstack-engineer
- **tier**: fast
- **depends_on**: 1
- **touches**: none (CI verification only)
- **done**: false

Run `rtk pnpm typecheck`, `rtk pnpm test`, `rtk pnpm build`. All must pass.
