# Project row presentation: color bullet and loop count

## Change ID
gh-88-project-row-color-loop-count

## Summary
Ensure each merged project row in the sidebar uses the project color reported by the main VM (or first instance) for its bullet, and shows the total loop count across all instances. The loop count updates as data refreshes.

## Problem
The sidebar already renders a colored dot and loop-count pill per merged project row. However, the merge logic takes the project color from whichever instance is iterated first — not necessarily the main VM. When two instances disagree on the color for a same-named project, the displayed color may be non-deterministic (order-dependent).

## Solution
- Pass `mainVmId` to the `Sidebar` component so the merge algorithm can prefer the main VM's project color.
- In the `projectNodes` useMemo, when constructing a `MergedProjectNode`, if the main VM's instance has this project, use its color; otherwise fall back to the first instance's color (current behavior).
- The loop count (`allLoops.length`) already sums across all instances and is reactive to polling. No change needed there.
- Add i18n key `sidebar.loopCount` with value `"{count} loops"` for the loop-count pill tooltip.

## Acceptance criteria mapping
- [x] Each row renders a colored bullet using the color loop-task reports for that project; if merged instances disagree, use the master/first instance's color deterministically
- [x] Each row shows the total loop count across the instances that contain the project; it updates when loop data refreshes

## Affected files
- `src/renderer/src/components/Sidebar.tsx` -- add `mainVmId` prop, adjust merge color logic, add tooltip to loop-count pill
- `src/renderer/src/App.tsx` -- pass `mainVmId` to Sidebar
- `src/renderer/src/i18n/en.json` -- add `sidebar.loopCount` key
