# Proposal: Poll loops per instance on a 5s interval

## Change ID

gh-101-poll-loops-per-instance

## Summary

Loop lists are currently polled only for the **selected** environment at a single 5s interval, leaving all other environments' loop data stale. This change moves loop polling to run **per connected instance** on a ~5s cadence, pauses polling for unreachable instances, and resumes automatically on recovery. All data flows through the existing `perEnvLoops` store consumed by the loop summary bar, cards, and rollups.

## Problem

- Only the **selected** environment's loops are polled every 5s. All other environments see their loop data only from incidental reads or never at all.
- The sidebar's fleet health rollup, inbox, and loop summary bar all read from `perEnvLoops`, which is empty for non-selected environments.
- When a user switches to a different environment, there is a cold-start delay before loop data appears.
- The issue explicitly asks: "Loop lists poll from each connected instance's API every ~5s (matching v1), scoped to what the UI needs."

## Solution

### Approach

Replace the single `fetchLoops(selected)` polling effect with a **per-environment polling effect** that iterates all connected environments and fetches their loops every 5s. The approach is:

1. **Per-environment polling loop**: A single `useEffect` that sets up a 5s `setInterval`, and on each tick iterates all environments that are in `connected` phase (per `connectionStatus`), fetching their loops via `fetchLoops`. Each successful fetch updates `perEnvLoops[envId]` and also updates `loops` + `lastUpdated` for the selected environment.
2. **Paused for unreachable**: Environments whose `connectionStatus` is not `connected` are simply skipped on each tick — no fetch attempted. When the connection supervisor transitions them back to `connected`, the next tick naturally picks them up (resume on recovery).
3. **Single data store**: `perEnvLoops` remains the single source of truth. The `loops` state variable (for the selected env) is derived from `perEnvLoops[selectedId]` to avoid duplication.
4. **Mock adapter**: The existing `fetchLoops` already works for mock environments via `MockApiService.request`. No new mock adapter code is needed since the polling simply uses `fetchLoops` for each environment.

### Scope

- **Files changed**: `src/renderer/src/App.tsx` (primary)
- **No new IPC channels**: Uses existing `fetchLoops` → `apiRequest` → `window.api` path.
- **No new services**: The existing `IApiService` / `fetchLoops` function is sufficient.
- **No UI changes**: The sidebar, loop bar, cards, and rollups already read from `perEnvLoops`. The improvement is in the data freshness.

## Acceptance Criteria

- [ ] Loop lists poll from each connected instance's API every ~5s
- [ ] Polling pauses for unreachable instances (not `connected` phase)
- [ ] Polling resumes automatically when an instance recovers to `connected`
- [ ] Data flows through the existing `perEnvLoops` store consumed by bar, cards, and rollups
- [ ] Mock adapter continues to work (`pnpm dev:web`)
- [ ] `pnpm typecheck` passes
