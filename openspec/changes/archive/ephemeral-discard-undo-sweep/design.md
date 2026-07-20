## Context

Orbion's chat sessions are either persisted (sidebar-listed, explicit "kept" state) or ephemeral (scratch, `persisted: false`). Currently, ephemeral sessions accumulate indefinitely in the config store until manually removed. The design model (from the issue's shared context) specifies: "ephemeral chats are discarded when you leave them (with undo); an inactivity sweep is only a backstop." This change implements both the discard-on-leave flow and the inactivity backstop sweep.

## Goals / Non-Goals

**Goals:**
- Implement discard-on-leave for ephemeral sessions with a short undo toast window
- Implement a background inactivity sweep that removes abandoned ephemeral sessions
- Provide a reusable toast component matching the existing design system
- Ensure sessions currently open in a window are never swept
- Keep the mock adapter working for browser-only dev

**Non-Goals:**
- This does NOT change the persist/unpersist toggle behavior
- This does NOT add user-configurable sweep interval UI (uses a hardcoded default)
- This does NOT implement "trash" or soft-delete — after the undo window, deletion is permanent
- This does NOT sweep persisted sessions (they are always kept)
- This does NOT add any new sidebar navigation or top-level UI surface

## Decisions

1. **Undo window: 5 seconds** — long enough to notice and click, short enough to feel decisive. Matches the app's "near-static" motion philosophy.
2. **Sweep interval: 4 hours, keyed on `lastActiveAt`** — never on `createdAt`. Four hours is long enough that an active user never sees a sweep, short enough to prevent indefinite accumulation.
3. **Sweep runs in the renderer via a `setInterval`** (not main process) because the renderer knows which session is currently active and can exempt it. The sweep calls a main-process IPC handler (`config:sweepEphemeralSessions`) that does the actual deletion.
4. **Toast is a React context provider** — `ToastProvider` wraps the app, `useToast()` hook exposes `showToast()`. This avoids prop-drilling and works with the existing component tree.
5. **Discard triggers on view change** — when `App.tsx`'s `view` state moves away from a session view (`view.kind !== "session"` or `view.sessionId !== previousSessionId`), and the left session was ephemeral, the discard flow fires.
6. **When undo fires, we navigate back to the session** — restoring the exact view state is achieved by calling `handleNavigateToSession(sessionId)` which sets both `activeSessionId` and `view`.
7. **The sweep IPC returns removed session IDs** — the renderer uses these to clean up its local `sessions` state and any open toast references.

## Risks / Trade-offs

- **5-second undo window may feel short** for users who switch tabs and come back. This is intentional: the design says "discard when you leave," not "ask whether to discard." The undo window is a safety net, not a confirmation dialog.
- **No soft delete** — after the undo window expires or the sweep runs, transcript data is permanently gone. This is by design (scratch = temporary) but users who expect "undo" available later will be surprised. Mitigated by the auto-persist threshold (8 turns) which promotes long sessions before sweep risk.
- **Sweep timer restarts on app restart** — if the user closes and reopens Orbion, the sweep timer resets. This is fine because the sweep checks `lastActiveAt` at runtime, not at timer start.
