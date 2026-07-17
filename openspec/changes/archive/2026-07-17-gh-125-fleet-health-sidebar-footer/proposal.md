# Fleet health summary in the sidebar footer, click to jump

## Change ID
gh-125-fleet-health-sidebar-footer

## Summary
The sidebar footer now summarizes the fleet estate (instance count + connection summary) and surfaces failure/unreachable counts as actionable pills that jump the user to the problem.

## Problem
Users have no always-visible fleet health at a glance. To find failing loops or unreachable instances, they must scan the tree or open the inbox. The sidebar footer currently shows only the Orbion mark and the activity readout — it wastes the one always-visible surface that should give a fleet-level overview.

## Solution
- Add a `FleetHealthFooter` component that sits in the sidebar footer, replacing the current `sidebar-footer` layout.
- Compute fleet-wide aggregates from existing data (`perEnvLoops`, `health`, `environments`):
  - Total instance count + connection summary ("3 instances · 2 connected")
  - Failure summary: count of loops that are `failed` (non-zero lastExitCode) or `stopped`, displayed as a danger-styled pill ("1 loop failing"), only when count > 0
  - Unreachable count: count of environments with health `offline` / `blocked` / `unknown`, displayed as a distinct muted pill ("1 unreachable"), only when count > 0
- Click-to-jump navigation:
  - If there is exactly one failing loop across the fleet, clicking the failure pill selects the loop's environment and navigates to that loop's detail view (single-jump)
  - If there are multiple failing loops in the same project, clicking navigates to that project (expand affected project)
  - If there are multiple failing loops across different projects/environments, clicking navigates to the inbox view (fleet-wide triage)
  - Clicking the unreachable pill selects the first unreachable environment so the user can retry
- The existing `FleetActivityReadout` stays adjacent; the new health summary is to its left

## Acceptance criteria mapping
- [x] Footer shows instance count + connection summary
- [x] Appending failure summary ("1 loop failing", alert-styled) when relevant
- [x] Appending unreachable count ("1 unreachable", distinct) when relevant
- [x] Clicking the failure summary: single failed loop -> opens loop card; multiple -> expands affected project or goes to inbox
- [x] Clicking unreachable count selects the first unreachable environment

## Affected files
- `src/renderer/src/components/FleetHealthFooter.tsx` — new component
- `src/renderer/src/components/Sidebar.tsx` — integrate FleetHealthFooter, add navigation callbacks
- `src/renderer/src/App.tsx` — pass navigation callbacks to Sidebar
- `src/renderer/src/i18n/en.json` — fleet health i18n keys
- `src/renderer/src/theme.css` — fleet health footer styles
