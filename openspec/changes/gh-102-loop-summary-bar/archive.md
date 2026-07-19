# Archive: Loop summary bar under the chat header

## Change ID

gh-102-loop-summary-bar

## Status

Completed

## Summary

Added a thin always-visible line under the chat header that summarizes the session's project x instance loops: healthy counts collapsed to a single number, exception states (failed, paused, finished) as separate colored segments, the most imminent next-run countdown, and a nudge when there are no loops. Also extended the LoopStatus type to include `failed` and `finished` states.

## What Changed

### New Files

- `src/renderer/src/components/LoopSummaryBar.tsx` — Pure-presentational component that renders the ambient loop summary bar
- `src/renderer/src/components/useNextRunCountdown.ts` — Hook returning a ticking countdown label for the most imminent next run

### Files Modified

- `src/renderer/src/types.ts` — Added `"failed"` and `"finished"` to `LoopStatus`
- `src/renderer/src/format.ts` — Added `STATUS_COLORS` entries for `failed` and `finished`
- `src/renderer/src/fleet-mapping.ts` — Maps `failed` → FleetItemStatus `"failed"` and `finished` → `"completed"`
- `src/renderer/src/theme.css` — Added `--status-failed` and `--status-finished` CSS custom properties, plus loop summary bar styles
- `src/renderer/src/i18n/en.json` — Added `loopSummary.*` i18n keys
- `src/renderer/src/components/SessionChatView.tsx` — Added `loops` prop, renders `LoopSummaryBar` under the header
- `src/renderer/src/App.tsx` — Scopes `perEnvLoops` to the session's project before passing to `SessionChatView`
- `src/renderer/src/services/mock/MockServices.ts` — Added mock loops with `failed`, `finished`, and `paused` statuses

### Behavioral Changes

| Before | After |
|--------|-------|
| No ambient loop status visible in chat | Thin bar under header shows loop counts, exceptions, and next-run |
| `LoopStatus` missing `failed` and `finished` | Full six-state type matching the loop-task daemon |
| No countdown for next scheduled loop run | Right side of bar ticks down to the most imminent next run |
| No nudge when no loops exist | Bar shows "No loops yet — ask to create one" |
| Unreachable instance could show stale counts | Muted "X loops — status unknown" when unreachable |

### No New

- No new IPC channels — reads from existing `perEnvLoops` state already polled by App.tsx
- No new services or DI registrations — pure-presentational component
- No new dependencies

## Verification

- `pnpm typecheck` passes (no new errors introduced)
- Renderer TypeScript (`tsc --noEmit -p tsconfig.web.json`) — no new errors from modified files
- Mock mode (`pnpm dev:web`) continues to work with new mock loop states
