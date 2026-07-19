# Archive: Live log follow on the loop card via SSE

## Change ID

gh-106-live-log-follow-loop-card

## Status

Completed

## Summary

Implemented live SSE log streaming on the LoopCard component. While a loop card is visible in the viewport and the loop is in an active state (running/waiting), the card subscribes to the loop's log SSE stream via the existing `stream:subscribe` bridge and appends lines live with autoscroll. The subscription is torn down when the card scrolls out of view using an IntersectionObserver.

## Files Changed

- `src/renderer/src/components/LoopCard.tsx` — replaced static `fetchLogs` tail with live SSE streaming, added IntersectionObserver for visibility gating, added autoscroll behavior, added LIVE indicator
- `src/renderer/src/i18n/en.json` — added `loopCard.live` and `loopCard.disconnected` i18n keys
- `src/renderer/src/theme.css` — added pulsing LIVE dot styles, smooth scroll on log content

## Acceptance Criteria Met

- [x] While visible, the loop card subscribes to the loop's log SSE stream and appends lines live
- [x] Subscription tears down when card is no longer visible (IntersectionObserver)
- [x] Log content auto-scrolls to bottom as new lines arrive, pauses if user scrolls up
- [x] Initial 10-line tail is fetched and shown before live lines start
- [x] In-memory lines are capped at 50 for the compact card view
- [x] Mock adapter continues to work (MockStreamService already emits synthetic lines)
- [x] `pnpm typecheck` passes (no new errors inLoopCard.tsx)
