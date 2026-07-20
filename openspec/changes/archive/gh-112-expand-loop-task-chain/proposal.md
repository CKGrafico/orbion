# Proposal: Expand a loop card into its read-only task chain

## Change ID

gh-112-expand-loop-task-chain

## Summary

When a loop has an associated task chain (`taskId`), the loop card exposes an expand affordance ("Tasks") that reveals the chain of tasks in execution order as numbered steps. Data comes from the existing `GET /api/tasks` endpoint. The chain is strictly read-only — no editing affordances. The on-success path forms the main chain; on-failure branches are shown visually.

## Problem

- Users have no way to understand what a loop does beyond its top-level command.
- Loops that use task chains (Build → Test → Deploy, with failure branches) are opaque from the card surface.
- The issue asks: "An expand affordance reveals the loop's tasks in execution order as numbered steps."

## Solution

### Approach

1. **Chain resolution** — `resolveTaskChain()` walks the on-success chain as the main path and records on-failure branches. It guards against cycles (max 20 steps) and resolves tasks from the `GET /api/tasks` response keyed by `LoopMeta.taskId`.

2. **LoopCard expand** — A chevron + "Tasks" label appears in the meta row when `loop.taskId` is set and the instance is reachable. On first expand, tasks are fetched via `fetchTasks()` and cached for subsequent toggles.

3. **TaskChainView** — A read-only component that renders numbered steps with task name as the primary display. The raw command is folded behind a "Show command" / "Hide command" disclosure. On-failure branches are shown with a "on failure" branch label at depth 1.

4. **Mock adapter** — Enriched `MOCK_TASKS` with realistic chaining (Build→Test→Notify failure; Lint→Format check; Deploy→Notify failure) and wired `taskId` on loops 1, 3b, and 6.

5. **Visual language** — Follows the existing dark warm-gray theme with floating rounded panels, plain CSS design tokens, and inline monospace for commands.

### New files

- `src/renderer/src/components/TaskChainView.tsx` — chain resolution + display component

### Modified files

- `src/renderer/src/components/LoopCard.tsx` — expands to show task chain
- `src/renderer/src/services/mock/MockServices.ts` — enriched mock tasks + taskId on loops
- `src/renderer/src/i18n/en.json` — i18n keys for task chain
- `src/renderer/src/theme.css` — CSS styles for task chain + expand toggle

## Acceptance criteria

- [x] An expand affordance ("Tasks") appears on loop cards whose loop has a taskId
- [x] Expanding reveals the loop's tasks in execution order as numbered steps
- [x] Read-only; no editing affordances
- [x] Command is folded behind a disclosure
- [x] On-failure branches are shown visually
- [x] Mock adapter works (browser-only dev mode)
- [x] Existing visual language maintained
