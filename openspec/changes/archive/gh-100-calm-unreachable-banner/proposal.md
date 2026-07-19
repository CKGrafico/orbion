# Proposal: Calm unreachable banner in chats homed on a dark instance

**Change ID:** gh-100-calm-unreachable-banner
**Issue:** #100
**Status:** implementing

## Problem

When a chat's home instance goes dark (unreachable), there is no calm, persistent signal in the chat view. The existing `stale-banner` in LoopDetail says "Instance unreachable — showing last-known data", but the chat session (SessionChatView) has no equivalent. Users see no visual indication that sending is unavailable, and there's no auto-clearing on recovery — leading to confusion or a cascade of error toasts.

## Proposed Solution

Add a **single persistent banner** at the top of the chat scroll area when the session's home instance is unreachable or reconnecting. The banner:

1. Shows `<instance> unreachable — reconnecting…` when reachability is `unreachable` or `reconnecting`.
2. Clears **automatically** when reachability transitions back to `connected` — no toast/dialog spam.
3. The composer indicates sending is unavailable while the instance is dark (disabled textarea + muted placeholder).
4. Follows the existing `stale-banner` visual pattern (warm-amber tint, icon, calm tone).

This extends an existing surface (SessionChatView + ChatComposer) rather than adding new navigation or surfaces. The reachability data is already available via `IReachabilityService.onStatusChange` and is consumed in App.tsx — we just need to thread it into SessionChatView and ChatComposer.

## Scope

- `SessionChatView.tsx`: Accept `reachability` prop, render banner between header and scroll area.
- `ChatComposer.tsx`: Accept `isReachable` prop, disable textarea + show muted placeholder when false.
- `theme.css`: Add `.unreachable-banner` styles following `.stale-banner` pattern with subtle reconnecting animation.
- `en.json`: Add i18n keys for the banner text and disabled composer placeholder.
- `App.tsx`: Pass `reachability` down to SessionChatView; derive `isReachable` for the session's environment.

## Out of Scope

- No toast/dialog/error-cascade changes (the banner replaces that need).
- No inbox changes (the inbox already handles prolonged-outage escalation separately).
- No changes to the reachability tracker or connection supervisor (the data layer is already correct).
