# Tasks — gh-153: Diff view in review mode

## Task 1: Add `get-pr-diff` IPC types
- **Files:** `src/shared/ipc.ts`
- **What:** Add `"get-pr-diff"` to `InfraAction` union. Add `GetPrDiffParams`, `GetPrDiffResult`, `DiffFileEntry` interfaces.
- **Tier:** 1 (type-only, no runtime)
- **Agent:** frontend-engineer
- **Depends on:** —
- **Touches:** `src/shared/ipc.ts`

## Task 2: Implement main-process `get-pr-diff` handler
- **Files:** `src/main/index.ts`
- **What:** Add `handleGetPrDiff` function calling `gh pr diff <number> --repo <repo> [-- <path>]`. Parse the output to extract file entries. Return `GetPrDiffResult`. Wire into the `infra:executeAction` switch.
- **Tier:** 2 (main process, test with `pnpm typecheck`)
- **Agent:** frontend-engineer
- **Depends on:** Task 1
- **Touches:** `src/main/index.ts`

## Task 3: Add `parseDiffIntoFiles` utility
- **Files:** `src/renderer/src/features/review/parse-diff.ts`
- **What:** Pure function that takes a raw unified diff string and returns `DiffFileEntry[]` and a map of per-file diff sections. Handles `diff --git`, `Binary files`, hunk headers, and line counts.
- **Tier:** 1 (pure utility, no side effects)
- **Agent:** frontend-engineer
- **Depends on:** Task 1
- **Touches:** `src/renderer/src/features/review/parse-diff.ts`

## Task 4: Create `ReviewDiffView` component
- **Files:** `src/renderer/src/features/review/ReviewDiffView.tsx`
- **What:** React component that renders a two-column layout: file list on the left, diff content on the right. Uses `parseDiffIntoFiles` for file list. Fetches per-file diff on demand. Handles loading/error/binary states.
- **Tier:** 2 (React component + IPC)
- **Agent:** frontend-engineer
- **Depends on:** Task 3
- **Touches:** `src/renderer/src/features/review/ReviewDiffView.tsx`

## Task 5: Wire `ReviewDiffView` into `ReviewModeOverlay`
- **Files:** `src/renderer/src/features/review/ReviewModeOverlay.tsx`
- **What:** Replace the placeholder with `<ReviewDiffView />` in the main area.
- **Tier:** 1 (trivial wiring)
- **Agent:** frontend-engineer
- **Depends on:** Task 4
- **Touches:** `src/renderer/src/features/review/ReviewModeOverlay.tsx`

## Task 6: Add i18n keys and CSS
- **Files:** `src/renderer/src/i18n/en.json`, `src/renderer/src/theme.css`
- **What:** Add `reviewMode.diffView.*` i18n keys. Add CSS classes for diff viewer (file list, diff pane, line coloring, binary badge).
- **Tier:** 1 (declarative)
- **Agent:** frontend-engineer
- **Depends on:** —
- **Touches:** `src/renderer/src/i18n/en.json`, `src/renderer/src/theme.css`

## Task 7: Add mock handler for `get-pr-diff`
- **Files:** `src/renderer/src/services/mock/MockServices.ts`
- **What:** Add `get-pr-diff` action handler in `MockInfraService.executeAction()` returning a realistic synthetic diff string.
- **Tier:** 1 (mock data)
- **Agent:** frontend-engineer
- **Depends on:** Task 1
- **Touches:** `src/renderer/src/services/mock/MockServices.ts`

## Task 8: Verify typecheck
- **What:** Run `pnpm typecheck` and fix any issues.
- **Tier:** 1
- **Agent:** frontend-engineer
- **Depends on:** All tasks
