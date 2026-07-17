# Tasks — gh-134: Per-loop run activity summary

## Task 1: Add run-activity computation helpers

- **Agent:** default
- **Tier:** 1
- **Depends on:** —
- **Touches:** `src/renderer/src/format.ts`
- **Description:** Add pure functions `runsToday`, `avgDuration`, `lastRunDuration`, `formatDurationShort` to `format.ts`. All are derived from the existing `RunRecord[]` type. Import `RunRecord` from `types.ts`.

## Task 2: Add i18n keys

- **Agent:** default
- **Tier:** 1
- **Depends on:** —
- **Touches:** `src/renderer/src/i18n/en.json`
- **Description:** Add keys under `activitySummary` (runsToday, avgDuration, lastDuration) and `loopDetail` (activityToday, activityAvgDuration, activityLastDuration).

## Task 3: Update loop-row UI

- **Agent:** default
- **Tier:** 2
- **Depends on:** 1, 2
- **Touches:** `src/renderer/src/components/InstanceDetail.tsx`, `src/renderer/src/components/ProjectDetail.tsx`, `src/renderer/src/theme.css`
- **Description:** Add inline `LoopActivitySummary` component showing "N today" + "avg X" before the status pill in loop rows. Add CSS styles for `.loop-activity` and `.loop-activity-item`.

## Task 4: Update loop-detail overview

- **Agent:** default
- **Tier:** 2
- **Depends on:** 1, 2
- **Touches:** `src/renderer/src/components/LoopDetail.tsx`
- **Description:** Add meta-items for runs today, avg duration, last run duration after the existing "Runs" field. Shown conditionally.

## Task 5: Enrich mock data

- **Agent:** default
- **Tier:** 1
- **Depends on:** —
- **Touches:** `src/renderer/src/services/mock/MockServices.ts`
- **Description:** Add a few more mock `runHistory` entries to loop-1 and loop-2 so the activity summary is visible in `pnpm dev:web`.

## Verification

- `pnpm typecheck` must pass (no new errors)
- `pnpm dev:web` runs with mock data and shows activity summaries on loop cards
