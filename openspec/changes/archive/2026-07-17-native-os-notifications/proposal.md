# Native OS Notifications for Inbox Events with Deep-Linking

## Change ID
`native-os-notifications`

## Summary
Replace the renderer-side Web Notification API with native Electron OS notifications that respect OS do-not-disturb, support a global mute toggle, suppress notifications when the target view is already focused, and deep-link (clicking a notification navigates to the item's target view). Works from both warm and cold start.

## Motivation
The current notification system uses the browser `Notification` API inside the Electron renderer, which:
- Does not respect OS do-not-disturb / Focus Assist
- Cannot reliably focus the app window on click (especially on macOS)
- Has no deep-linking: clicking a notification only calls `window.focus()`
- Has no global mute toggle (only per-environment muting)
- Does not work when the app is minimized to tray / not focused

## Approach
1. **Move notification delivery to the main process** using `electron.Notification`, which:
   - Respects OS Do Not Disturb (Windows Focus Assist, macOS DND)
   - Fires a `click` event that can call `win.focus()` reliably
   - Works even when the window is minimized
2. **Add IPC channels** (`notification:send`, `notification:setMuted`, `notification:isMuted`, `notification:onNavigate`) in the existing `ipc.ts` → preload → main contract
3. **Persist the global mute flag** in `electron-store` alongside existing config
4. **Deep-linking**: the renderer passes a `deepLink` payload (environmentId + viewType + itemId) when requesting a notification. When the user clicks the notification, the main process sends this payload back to the renderer via `notification:navigate` IPC, and the renderer navigates to the target.
5. **Focus suppression**: the renderer checks whether it is already showing the target view before requesting a notification. The main process also skips if the window is currently focused and the renderer signals "already viewing."
6. **Cold-start**: stores the pending deep-link in `electron-store` on notification click. If the app was not running, `second-instance` or `activate` picks it up after the window is created.

## Tasks
See `tasks.md`
