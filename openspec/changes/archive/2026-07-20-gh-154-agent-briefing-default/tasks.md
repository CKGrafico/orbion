# Tasks — gh-154: Agent briefing first; raw diff as the fallback

## Task 1: Add `get-pr-briefing` IPC types
- **Files:** `src/shared/ipc.ts`
- **What:** Add `"get-pr-briefing"` to `InfraAction` union. Add `GetPrBriefingParams`, `BriefingFileGroup`, `BriefingSection`, `GetPrBriefingResult` interfaces.
- **Agent:** frontend-engineer.build
- **Depends on:** —
- **Touches:** [src/shared/ipc.ts]

## Task 2: Add briefing classification logic to diff-analyzer
- **Files:** `src/main/diff-analyzer.ts`
- **What:** Export `classifyDiffSections()` function that takes a raw unified diff string and returns `BriefingSection[]`. Classify files into "flagged" (high/medium risk per existing patterns) and "boilerplate" (formatting-only, import-only, lock files, generated). Produce a summary string.
- **Agent:** frontend-engineer.build
- **Depends on:** Task 1
- **Touches:** [src/main/diff-analyzer.ts]

## Task 3: Implement main-process `handleGetPrBriefing` handler
- **Files:** `src/main/index.ts`
- **What:** Add `handleGetPrBriefing` function that calls `gh pr diff` (reusing existing diff-fetch logic from `handleGetPrDiff`), then runs `classifyDiffSections()` on the result. Wire into the `infra:executeAction` switch.
- **Agent:** frontend-engineer.build
- **Depends on:** Task 2
- **Touches:** [src/main/index.ts]

## Task 4: Add `parseBriefingSections` renderer-side utility
- **Files:** `src/renderer/src/features/review/parse-diff.ts`
- **What:** Add helper functions for the renderer to work with `BriefingSection[]` data: count totals, group boilerplate labels, extract per-section diff lines for flagged files using `parseDiffLines`.
- **Agent:** frontend-engineer.build
- **Depends on:** Task 1
- **Touches:** [src/renderer/src/features/review/parse-diff.ts]

## Task 5: Create `ReviewBriefingView` component
- **Files:** `src/renderer/src/features/review/ReviewBriefingView.tsx`
- **What:** React component that fetches the briefing via `get-pr-briefing` infra action and renders: summary, flagged sections with inline diff hunks (reusing `DiffLineRow` from ReviewDiffView), boilerplate sections as collapsed expandable groups.
- **Agent:** frontend-engineer.build
- **Depends on:** Task 4
- **Touches:** [src/renderer/src/features/review/ReviewBriefingView.tsx]

## Task 6: Add review mode tab toggle and wire ReviewBriefingView as default
- **Files:** `src/renderer/src/features/review/ReviewModeOverlay.tsx`
- **What:** Add a segmented pill toggle ("Briefing" / "Raw diff") in the review mode header. Default to briefing view. Conditionally render `ReviewBriefingView` or `ReviewDiffView` based on selected tab.
- **Agent:** frontend-engineer.build
- **Depends on:** Task 5
- **Touches:** [src/renderer/src/features/review/ReviewModeOverlay.tsx]

## Task 7: Add i18n keys and CSS for briefing view
- **Files:** `src/renderer/src/i18n/en.json`, `src/renderer/src/theme.css`
- **What:** Add `reviewMode.briefing.*` i18n keys. Add CSS classes for briefing view (summary, flagged section, boilerplate section, expand/collapse, file headers, inline hunks).
- **Agent:** frontend-engineer.fast
- **Depends on:** —
- **Touches:** [src/renderer/src/i18n/en.json, src/renderer/src/theme.css]

## Task 8: Add mock handler for `get-pr-briefing`
- **Files:** `src/renderer/src/services/mock/MockServices.ts`
- **What:** Add `get-pr-briefing` action handler in `MockInfraService.executeAction()` returning a realistic briefing structure derived from the existing mock diff data.
- **Agent:** frontend-engineer.fast
- **Depends on:** Task 1
- **Touches:** [src/renderer/src/services/mock/MockServices.ts]

## Task 9: Verify typecheck
- **What:** Run `pnpm typecheck` and fix any issues.
- **Agent:** frontend-engineer.fast
- **Depends on:** All tasks
- **Touches:** []
