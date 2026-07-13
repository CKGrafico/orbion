# Tasks — feat-18-fleet-status-pills-unread-notifications

## 1. Pure fleet-status logic + tests ✅
- Files: `src/renderer/src/fleet-status.ts`, `tests/fleet-status.test.ts`
- `FleetItemStatus`, `PRIORITY_ORDER`, `highestPriority()`, `rollUpEnvironmentStatus()`, `isNotifiableStatus()`, `PILL_LABELS`, `PILL_COLORS`
- 20 tests pass

## 2. Fleet mapping (loop/chat → fleet item) + tests ✅
- Files: `src/renderer/src/fleet-mapping.ts`, `tests/fleet-mapping.test.ts`
- `loopStatusToFleetItem()`, `chatTurnToFleetItem()`
- 14 tests pass

## 3. Unread tracker hook ✅
- File: `src/renderer/src/use-unread-tracker.ts`
- `useUnreadTracker()` — `isUnread()`, `markVisited()`, `getUnreadIds()`
- Backed by localStorage (`orbion.unread.v1`)

## 4. Notification bridge ✅
- File: `src/renderer/src/use-notifications.ts`
- `createNotificationBridge()` — `sendNotification()`, `setMuted()`, `isMuted()`
- Uses browser `Notification` API; `onclick` focuses window + navigates
- Per-environment mute set (in-memory, synced with localStorage in App)

## 5. StatusPill + UnreadDot components ✅
- File: `src/renderer/src/components/StatusPill.tsx`
- `StatusPill` (sm/md) + `UnreadDot`

## 6. Sidebar integration ✅
- File: `src/renderer/src/components/Sidebar.tsx`
- New props: `fleetStatus`, `unreadEnvs`, `mutedEnvs`, `onToggleMute`
- Renders pills next to env name, unread dot on health dot, mute bell toggle

## 7. App wiring ✅
- File: `src/renderer/src/App.tsx`
- `perEnvLoops` state + background fetch for all environments
- `fleetStatus` memo (rolled up from per-env loop statuses)
- `unreadEnvs` memo
- `notificationBridge` with click-to-focus callback
- Notification firing on status transitions (respects mute)
- `mutedEnvs` persisted in localStorage (`orbion.muted.v1`)
- `markVisited` on environment select

## 8. Icon + CSS additions ✅
- File: `src/renderer/src/components/Icon.tsx` — added `bell`, `bellOff`
- File: `src/renderer/src/theme.css` — added `.status-pill`, `.status-pill-sm`, `.unread-dot`

## 9. OpenSpec change ✅
- Directory: `openspec/changes/feat-18-fleet-status-pills-unread-notifications/`
