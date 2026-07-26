# Tasks

## T1: Add getDismissedIds to InboxBridge interface
- **Files:** `src/shared/ipc.ts`
- **Agent:** inline
- **Depends on:** —
- **Action:** Add `getDismissedIds: () => Promise<string[]>` to `InboxBridge`

## T2: Wire IPC channel through preload, main handler, and validation
- **Files:** `src/preload/index.ts`, `src/main/index.ts`, `src/main/ipc-validation.ts`
- **Agent:** inline
- **Depends on:** T1
- **Action:** Add `inbox:getDismissedIds` channel in preload, handler in main, validation entry

## T3: Fix InboxService.getDismissedIds() to call window.api
- **Files:** `src/renderer/src/services/impl/InboxService.ts`
- **Agent:** inline
- **Depends on:** T2
- **Action:** Replace `return []` with `return window.api.inbox.getDismissedIds()`

## V: Verify
- Run `rtk proxy pnpm typecheck`, `rtk proxy pnpm test`, `rtk proxy pnpm build`
