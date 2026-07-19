# Merge same-name projects across instances into one sidebar entry

## Change ID
gh-87-merge-same-name-projects

## Summary
Deduplicate the sidebar project list by project name across all connected instances, so users navigating by work see one entry per project name instead of one per instance. Each merged entry tracks which instances contain a project of that name. Instances never appear as sidebar entries.

## Problem
When a user has several VMs (instances) and the same project name exists on multiple instances (e.g. "Default" on every instance, "ETL" on two production VMs), the sidebar currently shows a separate row per project-instance pair. This doubles or triples the visual noise without adding navigational value — the user thinks in terms of projects, not machines.

## Solution
- Refactor `Sidebar.tsx` project node model from `ProjectInstanceNode` (one per project-instance) to `MergedProjectNode` (one per project name across all instances).
- Each `MergedProjectNode` carries an `instances` array of `ProjectInstanceSlice` objects — each slice recording the `envId`, `envName`, `projectId`, and loops for one instance.
- All loops from every instance are aggregated into `allLoops` for count display and search.
- When a merged project spans multiple instances (`instanceCount > 1`), show a small numeric instance-count badge (reusing `.tree-instance-badge`) instead of the old per-node instance name badge.
- When the project is expanded and spans multiple instances, render instance group headers (`.tree-instance-group` + `.tree-instance-label`) above each instance's loops, so the user can tell which machine a loop belongs to.
- When there is only one instance, loops render as before (no group header, depth-1).
- Clicking a merged project selects the first reachable instance that has this project (preferring the currently selected environment).
- Add i18n key `sidebar.instanceCount` for the badge tooltip.
- Add CSS for `.tree-instance-group`, `.tree-instance-label`, and `.tree-node-depth-2`.
- The mock adapter already returns the same project names for all environments, naturally demonstrating the merge behavior.

## Acceptance criteria mapping
- [x] Projects fetched from every connected instance (/api/projects) are deduped by name into a single sidebar list
- [x] Each merged entry knows which instances contain a project of that name
- [x] Instances never appear as sidebar entries

## Affected files
- `src/renderer/src/components/Sidebar.tsx` -- refactor node model and rendering
- `src/renderer/src/theme.css` -- new CSS classes for instance groups
- `src/renderer/src/i18n/en.json` -- instance count tooltip
