# Proposal: Pipeline counts in the loop bar

## Change ID

gh-143-pipeline-counts-in-loop-bar

## Summary

For projects with configured pipeline labels (stored per-project in `projectPipelineLabels` in the config store), the loop summary bar appends pipeline state segments showing issue counts by label. These counts are fetched periodically via the platform CLI through the existing infra action `list-issues`. Pipeline segments are clickable, returning the matching issue stack in chat. The entire pipeline section is hidden for projects without pipeline labels configured.

## Problem

Users whose label chains drive work want pipeline state visible in the ambient bar, since backlog and loop state are one pipeline. Currently the loop bar only shows loop health; there is no at-a-glance view of how many issues sit in each pipeline label.

## Solution

### Approach

1. **New config: `projectPipelineLabels`** in the config store (following the existing `projectPickupLabels` pattern). Keyed by project ID, each value is an array of label strings representing the pipeline columns (e.g. `["to-implement", "to-refine", "to-review"]`).

2. **New IPC channels**: `config:getProjectPipelineLabels` and `config:setProjectPipelineLabels`, following the exact same pattern as the existing pickup labels channels.

3. **New IConfigService methods**: `getProjectPipelineLabels(projectId)` and `setProjectPipelineLabels(projectId, labels[])`.

4. **New `usePipelineCounts` hook**: Accepts environment ID, project ID, and pipeline labels. Periodically calls the infra `executeAction` with `list-issues` for each configured label, returning a `Record<string, number>` of label-to-count. Polls on the same cadence as loop polling (~5s is aggressive; ~30s is a reasonable cadence for issue counts since they change slowly). Short-circuits when no pipeline labels are configured.

5. **Extend `LoopSummaryBar`**: After the existing loop status segments and next-run countdown, append pipeline label count segments (right side, after a divider). Each segment shows the label name and count (e.g. "3 to-implement"), styled with a subtle dot and the muted text color. Segments are clickable, calling `onPipelineSegmentClick(label)` which the parent (SessionChatView) handles by inserting an issue list into the chat stream via the infra service.

6. **Wire in `SessionChatView`**: Accept pipeline labels from the parent, pass counts to the bar, handle pipeline segment clicks by invoking the infra service's `list-issues` action and inserting the result as a user turn + assistant turn in the chat.

7. **Wire in `App.tsx`**: Load pipeline labels per session's project, pass down to `SessionChatView`.

8. **Mock adapter**: `getProjectPipelineLabels` returns `["to-implement", "to-refine"]` in mock mode; `setProjectPipelineLabels` is a no-op. The pipeline counts hook returns mock counts.

9. **Hidden when unconfigured**: If `projectPipelineLabels` for the session's project is empty or missing, the pipeline section is entirely absent from the bar.

### Scope

- **New files**: `usePipelineCounts.ts` (hook), `openspec/changes/gh-143-pipeline-counts-in-loop-bar/` (this proposal)
- **Files changed**:
  - `src/main/config-store.ts` (add `projectPipelineLabels` schema + CRUD)
  - `src/main/index.ts` (add IPC handlers)
  - `src/main/ipc-validation.ts` (add validators)
  - `src/shared/ipc.ts` (add ConfigBridge methods)
  - `src/preload/index.ts` (expose new bridge methods)
  - `src/renderer/src/services/interfaces.ts` (add to IConfigService)
  - `src/renderer/src/services/impl/ConfigService.ts` (implement)
  - `src/renderer/src/services/mock/MockServices.ts` (mock)
  - `src/renderer/src/components/LoopSummaryBar.tsx` (add pipeline segments)
  - `src/renderer/src/components/SessionChatView.tsx` (wire pipeline counts + click handler)
  - `src/renderer/src/App.tsx` (load pipeline labels per session)
  - `src/renderer/src/i18n/en.json` (new i18n keys)
  - `src/renderer/src/theme.css` (pipeline segment styles)

## Acceptance Criteria

- [ ] For projects with configured pipeline labels, the bar appends label counts fetched periodically via the platform CLI
- [ ] Pipeline segments are clickable, returning the matching issue stack in chat
- [ ] Hidden entirely for projects without pipeline labels configured
- [ ] Mock adapter continues to work
- [ ] `pnpm typecheck` passes
