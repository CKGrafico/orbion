# Fix: InboxService.getDismissedIds() always returns empty array

## Problem

`InboxService.getDismissedIds()` (lines 554-557) always returns `[]` when `window.api` is available. The Electron path unconditionally returns an empty array instead of fetching the dismissed IDs from the config store via IPC.

## Impact

- Previously dismissed inbox items reappear on every `buildItems()` cycle
- Dismiss button works transiently but dismissed state is never persisted
- Data loss from user perspective: dismissals are silently dropped

## Root Cause

The full IPC plumbing for `getDismissedIds` is missing:
- `InboxBridge` interface has no `getDismissedIds` method
- Preload has no `inbox:getDismissedIds` channel
- Main process has no `inbox:getDismissedIds` handler
- IPC validation schema has no `inbox:getDismissedIds` entry

The backend implementation (`getInboxDismissedIds()`) already exists in `config-store.ts`.

## Fix

Wire the existing backend function through the full IPC stack and fix the renderer method to call it.

## Tasks

1. Add `getDismissedIds` to `InboxBridge` interface in `src/shared/ipc.ts`
2. Add `getDismissedIds` IPC channel in `src/preload/index.ts`
3. Add `inbox:getDismissedIds` handler in `src/main/index.ts` calling `getInboxDismissedIds()`
4. Add `inbox:getDismissedIds` validation in `src/main/ipc-validation.ts`
5. Fix `InboxService.getDismissedIds()` to call `window.api.inbox.getDismissedIds()`

## References

- Issue #376
