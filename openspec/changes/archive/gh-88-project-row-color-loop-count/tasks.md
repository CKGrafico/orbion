# Tasks: gh-88-project-row-color-loop-count

## Task 1: Pass mainVmId to Sidebar and prefer main-VM color on merge
- **Files**: `src/renderer/src/components/Sidebar.tsx`, `src/renderer/src/App.tsx`
- **Action**: Add `mainVmId` prop to Sidebar. In `projectNodes` useMemo, when constructing a new MergedProjectNode, check if the main VM's environment has this project name — if so, use its project color; otherwise use the first instance's color. Pass `mainVm?.id ?? null` from App.tsx.
- **Verify**: Typecheck passes; when two instances have the same project name with different colors, the main VM's color is used.

## Task 2: Add loop-count tooltip i18n key
- **Files**: `src/renderer/src/i18n/en.json`, `src/renderer/src/components/Sidebar.tsx`
- **Action**: Add `sidebar.loopCount` = `"{count} loops"`. Add a `title` attribute to the loop-count `<span className="tree-pill">` element using this i18n key.
- **Verify**: Hovering the loop-count pill shows translated tooltip.
