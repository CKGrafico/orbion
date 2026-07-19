# Proposal: Live log follow on the loop card via SSE

## Change ID

gh-106-live-log-follow-loop-card

## Summary

While a loop card is visible, subscribe to the loop's log SSE stream (existing `stream:subscribe` bridge) and append lines live with autoscroll. Tear down the subscription when the card is no longer visible.

## Problem

The LoopCard component currently fetches a static 10-line log tail via `fetchLogs()` on mount and never updates it. When a loop is running, users see stale log output that does not reflect what is happening right now. The issue asks for live streaming so the card output updates in real-time while the user is watching.

## Solution

### Approach

1. **Replace static tail with live SSE streaming in LoopCard**: Use the existing `useLiveLog` hook (already used by `LogViewer`) to subscribe to the loop's log SSE stream. Keep the initial 10-line tail fetch as a seed, then append live lines from the stream.
2. **Visibility-gated subscription**: Use `IntersectionObserver` to detect when the card enters/leaves the viewport. Subscribe only while visible; tear down the SSE subscription when the card scrolls out of view.
3. **Autoscroll**: Auto-scroll the log content div to the bottom as new lines arrive, unless the user has manually scrolled up.
4. **Cap in-memory lines**: Keep a cap (50 lines) on in-memory log lines for the compact card view. Oldest lines are trimmed when the cap is hit.
5. **Rely on existing infrastructure**: No new IPC channels, no new services. Reuse the `stream:subscribe` / `stream:unsubscribe` / `stream:event` bridge, the `subscribeLogs()` function from `api.ts`, and the `useLiveLog` hook with its automatic reconnect logic.
6. **Mock adapter**: The `MockStreamService` already emits synthetic log lines every 3 seconds. The card-level subscription reuses this path, so `pnpm dev:web` works out of the box.

### Scope

- **Files changed**: `src/renderer/src/components/LoopCard.tsx` (replace static tail with live streaming + autoscroll + visibility gating)
- **No new files**: Reuse existing hooks and services
- **No new IPC channels**: Uses existing `stream:subscribe` bridge
- **No new types**: Uses existing `StreamState`, `subscribeLogs`, `useLiveLog`
- **CSS**: Minor style additions to `theme.css` for live indicator and smooth scroll

## Acceptance Criteria

- [ ] While visible, the loop card subscribes to the loop's log SSE stream and appends lines live
- [ ] Subscription tears down when the card is no longer visible (IntersectionObserver)
- [ ] Log content auto-scrolls to bottom as new lines arrive, pausing if user scrolls up
- [ ] Initial 10-line tail is fetched and shown before live lines start
- [ ] In-memory lines are capped at 50 for the compact card view
- [ ] Mock adapter continues to work (`pnpm dev:web`)
- [ ] `pnpm typecheck` passes
