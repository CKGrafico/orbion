# feat: fleet status — priority pills, unread dots and OS notifications

## Why

Several VMs, each with loops and chat threads, all changing state on their own. The sidebar has to answer "what needs me right now" without opening anything. Health dots alone stop being enough once agents ask questions and loops fail at 3am.

## What

1. **Priority pills per environment** — a fixed priority order: `pending-approval > awaiting-input > failed > working > completed > idle`. An environment shows the highest-priority state among its children (rolled up), so a collapsed sidebar still surfaces whatever is blocked on you.

2. **Unread tracking** — an environment that had a loop complete since you last visited it gets an unread dot; opening it clears it. The app keeps last-visited timestamps in localStorage.

3. **OS notifications** (Windows and macOS to start) — for states that genuinely need a human: an approval request, an agent question, a failed loop run. Clicking one focuses the app on the right environment. Per-environment mute, because a noisy dev VM shouldn't ping anyone at night.

## Implementation

- `fleet-status.ts` — pure functions: `highestPriority`, `rollUpEnvironmentStatus`, `isNotifiableStatus`, plus the `FleetItemStatus` enum with `PRIORITY_ORDER`, `PILL_LABELS`, `PILL_COLORS`.
- `fleet-mapping.ts` — maps `LoopStatus` → `FleetItemStatus` and `ChatTurn` state → `FleetItemStatus`.
- `use-unread-tracker.ts` — React hook backed by localStorage. Stores `lastVisited` timestamps per item; `isUnread(id, completedAt)` compares them.
- `use-notifications.ts` — `createNotificationBridge()` using the browser `Notification` API (works in Electron). Tracks muted environments in-memory; fires OS notifications with `onclick` to focus + navigate.
- `StatusPill.tsx` — small pill UI component + `UnreadDot`.
- `Sidebar.tsx` — receives `fleetStatus`, `unreadEnvs`, `mutedEnvs`, `onToggleMute` as new props; renders pills, dots, and bell/bellOff mute toggle.
- `App.tsx` — computes `fleetStatus` from `perEnvLoops` (new background fetch for all envs), computes `unreadEnvs`, wires `notificationBridge`, fires notifications on status transitions, persists muted envs in localStorage.
- `Icon.tsx` — added `bell` and `bellOff` icons.
- `theme.css` — added `.status-pill`, `.status-pill-sm`, `.unread-dot` styles.
- Tests: `tests/fleet-status.test.ts` (20 tests) and `tests/fleet-mapping.test.ts` (14 tests) covering all pure logic.

## Acceptance criteria

- [x] Sidebar shows pills following the documented priority order, rolled up per environment
- [x] Threads that completed while away show an unread dot that clears on open
- [x] Approval requests and failed loop runs raise OS notifications with click-to-focus
- [x] Muting an environment silences its notifications but keeps its pills
