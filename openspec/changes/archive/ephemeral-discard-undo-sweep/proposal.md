## Why

Ephemeral (scratch) chats currently live forever in the session list until explicitly removed. The design intent (from the issue and shared context) is that scratch chats should follow the user's attention: discarded when left, with a short undo window, and cleaned up by an inactivity sweep as a backstop. Without this, ephemeral sessions accumulate, cluttering the config store and confusing users who expected "scratch" to mean temporary.

## What Changes

- **Discard-on-leave with undo**: When the user navigates away from an unpersisted chat session, the session is not immediately deleted. Instead, a toast notification appears with an "Undo" button and a countdown (5 seconds). If the user clicks Undo, the session is restored exactly as-is (same view, same ID, same transcript). If the countdown expires, the session and its transcript are permanently deleted.
- **Inactivity sweep**: A background timer (configurable, default 4 hours) removes ephemeral sessions whose `lastActiveAt` exceeds the threshold. The sweep keys exclusively on `lastActiveAt`, never on `createdAt`. Sessions currently open in a window (i.e., the active `sessionId` in `App.tsx`) are exempt from sweep.
- **IPC channel for sweep**: New main-process IPC handler `config:sweepEphemeralSessions` that the renderer invokes periodically. The main process performs the deletion (session + transcript) and returns the IDs of removed sessions so the renderer can clean up local state.
- **Toast component**: A new lightweight toast/snackbar component positioned at the bottom of the main panel, matching the existing dark warm-gray design tokens. Used for the discard undo notification and any future transient messages.
- **i18n keys**: New keys for the discard toast, undo button, and sweep-related labels.

## Capabilities

### New Capabilities
- `ephemeral-discard`: Discard-on-leave flow for unpersisted chat sessions with an undo toast
- `ephemeral-sweep`: Background inactivity sweep for abandoned ephemeral sessions
- `toast-system`: Reusable toast/snackbar component for transient notifications

### Modified Capabilities

## Impact

- **Renderer**: `App.tsx` (view-change detection to trigger discard), new `ToastProvider`/`Toast` components, `SessionChatView.tsx` no changes needed (discard is triggered by navigation away)
- **Main process**: `config-store.ts` (new `sweepEphemeralSessions` function), `index.ts` (new IPC handler)
- **Shared IPC**: `ipc.ts` (new sweep result type, new IPC channel definition)
- **Preload**: `index.ts` (expose new IPC channel)
- **Mock services**: `MockServices.ts` (mock sweep implementation)
- **i18n**: `en.json` (new keys for toast, discard, sweep)
- **CSS**: `theme.css` (toast component styles)
