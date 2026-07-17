# Fleet Activity Readout for Agent Loops

**Issue:** #135
**Status:** done

## Problem

Users running agent loops unattended have no quiet, estate-wide signal that consumption is happening. Loop activity is visible only per-instance, requiring navigation to each VM.

## Solution

Add a compact fleet activity readout in the sidebar footer that aggregates runs-today across all reachable instances. Clicking it reveals top contributors (which loops ran the most today).

## Design

- **Placement:** sidebar footer, left of the existing Orbion brand mark
- **Shape:** a small chip/badge showing total runs today (e.g. "42r today")
- **Data source:** `perEnvLoops` already in App.tsx; `runsToday()` in `format.ts` already counts per-loop runs today from `runHistory`
- **Agent loop identification:** loops whose description or command matches agent patterns ("opencode", "claude", "copilot") are "agent loops"; if none found, all loops are used as fallback
- **Interaction:** clicking the badge opens a small popover listing top contributor loops sorted by runs today
- **Offliness:** offline instances are excluded from totals
- **Mock support:** mock loops already have `runHistory` with today entries, so the feature works in mock mode

## Scope

- New React component: `FleetActivityReadout`
- New CSS styles in `theme.css`
- Sidebar integration (footer area)
- i18n messages
- No new IPC channels, no new API calls, no backend changes

## Acceptance Criteria

- [ ] A compact figure in the sidebar footer totals runs today across reachable instances
- [ ] Agent loops are identified by heuristic; if none, all loops used as fallback
- [ ] Clicking it lists top contributors in a popover
- [ ] Offline instances are excluded
- [ ] Mock mode works
