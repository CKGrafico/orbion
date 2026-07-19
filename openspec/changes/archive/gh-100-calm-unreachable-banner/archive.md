# Archive: Calm unreachable banner in chats homed on a dark instance

**Change ID:** gh-100-calm-unreachable-banner
**Issue:** #100
**Archived at:** 2026-07-19

## Summary

Implemented a single persistent unreachable banner in the chat view when the session's home instance goes dark (unreachable/reconnecting):

1. **UnreachableBanner component** — rendered inline in SessionChatView when `reachability` is not `connected`:
   - Shows `<instance> unreachable — reconnecting…` (amber, with WifiOff icon)
   - Shows `<instance> reconnecting…` when in reconnecting state
   - Gentle 3s pulse animation to signal reconnection in progress
   - Clears automatically on recovery — no toast/dialog spam

2. **Composer disabled state** — ChatComposer receives `isReachable` prop:
   - Textarea disabled with muted placeholder "Instance unreachable — prompts will queue"
   - Send button disabled
   - Focus does not steal when unreachable

3. **Wiring** — App.tsx passes `reachability` and `environmentName` props to SessionChatView

## Acceptance criteria met

- ✅ When the home instance is unreachable, the chat shows a single persistent banner (`<instance> unreachable - reconnecting...`)
- ✅ It clears automatically on recovery; no toast/dialog spam
- ✅ The composer indicates sending is unavailable while dark

## Files changed

- `src/renderer/src/components/SessionChatView.tsx` — reachability prop, banner rendering, isReachable computed, passes to composer
- `src/renderer/src/chat/ChatComposer.tsx` — isReachable prop, disabled textarea + send, muted placeholder
- `src/renderer/src/App.tsx` — wires reachability + environmentName to SessionChatView
- `src/renderer/src/theme.css` — .unreachable-banner styles + disabled composer state
- `src/renderer/src/i18n/en.json` — unreachableBanner.* + chat.sendPlaceholderUnreachable keys
