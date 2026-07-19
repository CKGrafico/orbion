# gh-104: Represent the full loop-task state model

## Summary

Orbion's UI currently flattens the 6-state loop-task lifecycle (running, waiting, paused, stopped, failed, finished) into a smaller set of visual states, losing semantic meaning the CLI provides. This change makes all 6 states fully distinguishable by color and label in both the LoopCard and LoopSummaryBar, ensuring that:

- **Finished** (hit max-runs) is visually distinct from **Failed** (non-zero exit)
- **Paused** (schedule kept, can resume) is labeled differently from **Stopped** (schedule cleared, must re-create)
- Colors align with the loop-task TUI conventions

## Problem

1. **`LoopStatus` type includes `"idle"`** — not a real loop-task state. The daemon reports `waiting` for idle-between-runs. The `"idle"` variant is unused-by-the-daemon cruft.
2. **`fleet-mapping.ts` collapses states**: `stopped → failed`, `paused → idle`, `finished → completed`, `waiting → idle` — losing the paused-vs-stopped and finished-vs-failed distinctions.
3. **`STATUS_COLORS` maps `finished → var(--status-idle)` (grey)** and `stopped → var(--status-failed)` (red) — semantically wrong: finished is success, stopped is intentional-clear.
4. **`LoopSummaryBar` omits `stopped`** from both HEALTHY and EXCEPTION sets, meaning stopped loops are invisible in the bar.
5. **i18n has `statusIdle`** labels but `idle` is not a real loop-task state; the real waiting state uses the wrong label semantics.

## Approach

- Remove `"idle"` from `LoopStatus` — the daemon never emits it; it's been a source of confusion.
- Update `STATUS_COLORS` so `finished` gets a distinct green-ish tint (success) and `stopped` gets a different treatment from `failed`.
- Update `fleet-mapping.ts` to preserve the full 6-state semantics: `paused` and `stopped` both map to a new `"paused"` fleet item, `finished` maps to `"completed"`, and `waiting` maps to `"idle"`.
- Update `LoopSummaryBar` to include `stopped` as an exception status alongside `failed`, `paused`, `finished`.
- Update i18n keys to remove `idle`-specific labels and ensure all 6 states have distinct labels.
- Update theme.css to give `--status-finished` a success-aligned green and `--status-stopped` a warm amber distinct from danger red.
- Update the mock adapter to not use `idle` status.
