# Tasks: gh-87-merge-same-name-projects

## Task 1: Refactor Sidebar project node model
- **Files**: `src/renderer/src/components/Sidebar.tsx`
- **Action**: Replace `ProjectInstanceNode` with `MergedProjectNode` + `ProjectInstanceSlice`. Rewrite `projectNodes` useMemo to merge by project name. Update search filter and selection logic. Update rendering to show instance-count badge and instance group headers.
- **Verify**: Typecheck passes; no TS errors in Sidebar.tsx.

## Task 2: Add CSS for instance group rendering
- **Files**: `src/renderer/src/theme.css`
- **Action**: Add `.tree-instance-group`, `.tree-instance-label`, `.tree-node-depth-2` rules. Keep visually consistent with existing tree node styles (same muted color, uppercase label, compact spacing).
- **Verify**: Visual review in dev:web.

## Task 3: Add i18n key for instance count
- **Files**: `src/renderer/src/i18n/en.json`
- **Action**: Add `sidebar.instanceCount` = `"{count} instances"`.
- **Verify**: Tooltip shows translated text.
