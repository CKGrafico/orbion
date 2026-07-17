# Notification types: failure, finished, watch, digest

## Change ID
gh-127-notification-types

## Summary
Inbox items now carry a broad notification type (failure, finished, watch, digest) that drives type-appropriate icon and color treatment. Failure and finished items are generated from loop state transitions observed by the store between poll cycles.

## Problem
All inbox items were rendered with kind-specific but ad-hoc icon/color logic scattered across components. There was no unified category system for visual treatment, and no mechanism to detect when a loop transitioned to a failure or finished state in real time (only static derivation from current state).

## Solution
- Add `NotificationType` to `src/shared/ipc.ts`, a broad category that groups `InboxItemKind` values for visual treatment: failure (failed-loop, instance-offline, prolonged-offline), finished (finished-loop), watch (breach, pending-approval, awaiting-input), digest (new kind for grouped digests).
- Add `notificationType` field to `InboxItem`, computed at derivation time via `kindToNotificationType()`.
- Add `useLoopTransitions` hook that compares per-loop snapshots between poll cycles and fires callbacks for newly-observed failure or finished transitions (skipping first-load to avoid flooding).
- Wire the transition hook in App.tsx to send OS notifications when loops fail or finish.
- Update kind/color/icon mappings in InboxView and InboxPanel to use `notificationType` consistently.
- Add CSS custom properties `--nt-failure`, `--nt-finished`, `--nt-watch`, `--nt-digest` to theme.css.
- Add i18n keys for notification type labels, transition messages, and watch-cleared resolution.

## Acceptance criteria mapping
- [x] The item model supports typed items (failure / finished / watch / digest) with type-appropriate icon + color
- [x] Failure and finished items are generated from loop state transitions observed by the store
- [x] Only "you're needed" or "you asked" events become notifications (watch types only notify for existing breach/approval/input events; routine successful runs never create inbox items)

## Affected files
- `src/shared/ipc.ts` -- NotificationType, kindToNotificationType(), notificationType on InboxItem, digest kind, watch-cleared resolution
- `src/renderer/src/use-loop-transitions.ts` -- new hook for observing loop state transitions
- `src/renderer/src/App.tsx` -- wire loop transition hook, send notifications on failure/finished
- `src/renderer/src/services/impl/InboxService.ts` -- notificationType on derived items, kind labels for pending-approval/awaiting-input, query patterns for finished/watch
- `src/renderer/src/services/mock/MockServices.ts` -- notificationType on mock items, watch-cleared resolution
- `src/renderer/src/features/inbox/InboxView.tsx` -- KindIcon and kindColor use notificationType, digest icon
- `src/renderer/src/features/inbox/InboxPanel.tsx` -- typeIcon/typeClass based on notificationType
- `src/renderer/src/i18n/en.json` -- type labels, transition messages, watch-cleared resolution
- `src/renderer/src/theme.css` -- notification type color variables
