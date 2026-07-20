# Tasks: Expand a loop card into its read-only task chain

## Change ID

gh-112-expand-loop-task-chain

## Tasks

### Task 1: Task chain resolution logic + TaskChainView component

- **Tier:** 1 (core logic + component)
- **Touches:** `src/renderer/src/components/TaskChainView.tsx` (new)
- **Description:** Create `resolveTaskChain(startTaskId, tasks[])` that walks on-success chain as main path and records on-failure branches. Build `TaskChainView` component with numbered steps, command disclosure, and branch labels.
- **Verification:** Component renders without TypeScript errors.

### Task 2: Integrate expand affordance into LoopCard

- **Tier:** 1
- **Touches:** `src/renderer/src/components/LoopCard.tsx`
- **Depends on:** Task 1
- **Description:** Add expand chevron + "Tasks" label in meta row when `loop.taskId` is set. Fetch tasks on first expand, cache for subsequent toggles. Render `<TaskChainView>` below meta row when expanded.
- **Verification:** Card shows expand affordance on loops with taskId; chain renders on click.

### Task 3: Mock adapter + i18n + CSS

- **Tier:** 2
- **Touches:** `src/renderer/src/services/mock/MockServices.ts`, `src/renderer/src/i18n/en.json`, `src/renderer/src/theme.css`
- **Depends on:** Task 2
- **Description:** Enrich MOCK_TASKS with chained tasks. Wire `taskId` on mock loops. Add i18n keys. Add CSS styles matching existing visual language.
- **Verification:** `pnpm typecheck` passes (renderer). Mock mode shows task chain on expand.
