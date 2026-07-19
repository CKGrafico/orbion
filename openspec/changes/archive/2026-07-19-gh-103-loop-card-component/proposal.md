# Loop card component

## Change ID
gh-103-loop-card-component

## Source
GitHub Issue #103: "Loop card component"

## Summary
Implement a compact live card representing one loop — the noun the chat can summon and act on. The card shows status dot + name and a meta row (interval, run count, last exit, next run). It renders in the chat stream at message width and updates live from the loop store. Distinct visual treatment when failed.

## Acceptance criteria
- Card shows status dot + loop name (description or ID) as the header row.
- Meta row displays: interval, run count, last exit code, next run countdown.
- Renders in the chat stream at message width; updates live from loop data (polled every 5s via existing perEnvLoops).
- Distinct visual treatment when the loop's `lastExitCode` is non-zero (failed state).
- All six loop statuses are represented: running, waiting, paused, stopped, failed, finished.
- Works in both Electron and mock mode (browser-only dev).

## Notes
- Logs and actions are separate issues; this is the shell + live data binding.
- The loop card is a new TranscriptRow kind rendered in the SessionChatView chat stream.
- It reads from existing perEnvLoops data — no new API endpoints needed.
- Failed treatment: danger-tinted background + red border + exit code highlight.

## Scope
- New `LoopCard` component in `src/renderer/src/components/`.
- New `loop-card` row kind in `chat/types.ts` and rendering in `SessionChatView.tsx`.
- CSS styles in `theme.css`.
- i18n strings in `en.json`.
