# Archive: Expand a loop card into its read-only task chain

## Change ID

gh-112-expand-loop-task-chain

## Status

Completed

## Date

2026-07-20

## Summary

Implemented an expand affordance on loop cards that reveals the loop's task chain in execution order as numbered steps. The on-success path forms the main chain; on-failure branches are shown visually with branch labels. Data is fetched from the existing `GET /api/tasks` API endpoint. The chain is strictly read-only — no editing affordances. The command is folded behind a "Show command" disclosure.

## What changed

- **New:** `src/renderer/src/components/TaskChainView.tsx` — `resolveTaskChain()` logic + `TaskChainView` component with numbered steps, command disclosure, branch labels
- **Modified:** `src/renderer/src/components/LoopCard.tsx` — expand chevron + "Tasks" label in meta row, lazy task fetch on first expand, renders `<TaskChainView>` when expanded
- **Modified:** `src/renderer/src/services/mock/MockServices.ts` — enriched MOCK_TASKS with chained tasks (Build→Test→Notify, Lint→Format, Deploy→Notify), wired taskId on loops 1, 3b, 6
- **Modified:** `src/renderer/src/i18n/en.json` — i18n keys for task chain labels
- **Modified:** `src/renderer/src/theme.css` — CSS styles for task chain + expand toggle

## Verification

- `pnpm typecheck` passes (no new errors in renderer)
- Mock adapter works: loops with taskId show expand affordance, clicking reveals task chain with branches
