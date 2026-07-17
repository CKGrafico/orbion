# gh-134: Per-loop run activity summary on the card

## Summary

Show recent run activity on each loop card as the honest proxy for what it
consumes: **runs today** and **average / last run duration**, derived from the
`runHistory` field already returned by the loop-task API.

No fabricated money figures — cost is shown **only** if a runtime adapter
reports real usage; otherwise activity metrics only. Since loop-task does not
report spend, we show activity metrics only.

## Acceptance criteria

- Card shows **runs today** (count of `runHistory` entries that started today)
  and **average duration** / **last run duration**, derived from `runHistory`.
- No fabricated money figures: show cost only if a runtime adapter reports real
  usage; otherwise activity metrics only.
- Mock adapter still works (`pnpm dev:web`).

## Design

### Data flow

- The loop-task daemon already returns `runHistory: RunRecord[]` on each loop
  via `GET /api/loops` and `GET /api/loops/:id`. Each `RunRecord` includes
  `startedAt` (ISO timestamp) and `duration` (ms, or null if running/incomplete).
- We add **pure computation helpers** in `format.ts` that derive the activity
  summary from `runHistory`:
  - `runsToday(runHistory)` — count runs started after local midnight
  - `avgDuration(runHistory)` — average ms of completed runs with durations
  - `lastRunDuration(runHistory)` — most recent run's duration
  - `formatDurationShort(ms)` — compact human-readable duration string
- No new IPC channels or API endpoints required — all data is already available.

### UI surfaces

1. **Loop rows** (InstanceDetail + ProjectDetail) — a compact inline activity
   summary appears before the status pill in the right-hand metadata:
   - `6 today` + `avg 4.3s` (both mono, muted text)
   - Hidden when there are zero runs today and no durations.

2. **Loop detail overview card** — three new meta-items after the existing
   "Runs" field:
   - **Runs today** — count
   - **Avg duration** — formatted duration
   - **Last run duration** — formatted duration
   - Shown conditionally (only when there is data to display).

### Files touched

| File | Change |
|------|--------|
| `src/renderer/src/format.ts` | Add `runsToday`, `avgDuration`, `lastRunDuration`, `formatDurationShort` |
| `src/renderer/src/components/InstanceDetail.tsx` | Add `LoopActivitySummary` component, insert into loop rows |
| `src/renderer/src/components/ProjectDetail.tsx` | Same `LoopActivitySummary` component, insert into loop rows |
| `src/renderer/src/components/LoopDetail.tsx` | Add activity meta-items to overview card |
| `src/renderer/src/theme.css` | Add `.loop-activity` / `.loop-activity-item` styles |
| `src/renderer/src/i18n/en.json` | Add i18n keys for activity labels |
| `src/renderer/src/services/mock/MockServices.ts` | Enrich mock `runHistory` with more runs so the summary is visible |

### No new IPC / no new endpoints

All data comes from the existing `runHistory` field on the loop objects already
polled every 5s. No new daemon endpoints or IPC channels are required.
