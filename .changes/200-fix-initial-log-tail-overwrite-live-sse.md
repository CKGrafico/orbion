# Change: Fix initial log tail overwriting live SSE lines

- **Issue**: #200
- **Branch**: fix/issue-200-log-tail-overwrite-live-sse
- **Status**: implemented
- **Date**: 2026-07-19

## Problem

`LogViewer` starts the initial tail request (`fetchLogs`) and the live SSE subscription (`subscribeLogs`) concurrently. When live lines arrive before the tail request resolves, `setInitialRows` replaces the complete row buffer and silently discards those live lines.

## Root Cause

- `src/renderer/src/components/LogViewer.tsx:30-47` — fetch and subscribe start in the same effect without sequencing or reconciliation
- `src/renderer/src/components/useLogRows.ts:138-168` — `setInitialRows` resets the row ID counter and assigns `rowsRef.current = newRows`, replacing any live rows appended while the request was pending

## Fix

1. **Track live rows before tail resolves** — Added `tailPendingRef` and `liveRowsBeforeTailRef` to `useLogRows`. When `tailPendingRef` is true, `appendLines` and `appendEvent` add new rows to both the main buffer and the pre-tail tracking buffer.

2. **Merge instead of replace** — `setInitialRows` now builds `[...tailRows, ...deduplicatedLiveRows]` instead of `rowsRef.current = newRows`. Tail rows (historical) come first, live rows (newer) come after.

3. **Content-based deduplication** — Added `rowDedupeKey()` which produces stable text keys per row kind. When tail and live rows overlap (same content), the tail version is kept and the live duplicate is filtered out.

4. **No row ID reset** — `setInitialRows` no longer resets `rowIdCounter.current = 0`, preventing ID collisions with live rows that already received IDs.

5. **Always resolve tail phase** — `LogViewer.tsx` now calls `setInitialRows("")` even when the tail response is empty or errors, ensuring the tail phase is always resolved so the pre-tail buffer is cleared.

6. **Isolation on switch** — `reset()` clears `tailPendingRef` and `liveRowsBeforeTailRef` alongside the row buffer, preventing row leakage across loop/environment switches.

## Files Changed

- `src/renderer/src/components/useLogRows.ts` — merge logic, dedup, tracking refs
- `src/renderer/src/components/LogViewer.tsx` — always resolve tail phase
- `src/renderer/src/components/useLogRows.test.ts` — 12 regression tests (new file)

## Acceptance Criteria Verification

| Criterion | Status |
|-----------|--------|
| Every live line received after subscription begins remains visible after the initial tail resolves | Verified by test: "does NOT lose live lines when initial tail resolves after live events" |
| Initial tail and live events have a defined ordering and deduplication strategy | Verified by tests: merge ordering, dedup overlap, structured events |
| Switching loop or environment cannot merge rows from the previous selection | Verified by test: "does not mix rows across loop/environment switches" |
| Regression test where live events arrive before a delayed initial-tail response and verify no lines are lost | Verified by test: the core regression test for issue #200 |
