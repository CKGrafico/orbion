# Tasks — gh-136: Budget watch on run volume, with optional auto-pause

## Task 1: Add shared IPC types for budget watches and breaches

- **Agent:** default
- **Tier:** 1
- **Depends on:** —
- **Touches:** `src/shared/ipc.ts`
- **Description:** Add `BudgetWatch` and `BudgetBreach` interfaces to `ipc.ts`. Add `BudgetBridge` interface with `getWatches`, `addWatch`, `removeWatch`, `updateWatch`, `getBreaches`, `dismissBreach` methods. Extend `LoopTaskBridge` to include `budget: BudgetBridge`.

## Task 2: Add budget persistence in config-store

- **Agent:** default
- **Tier:** 1
- **Depends on:** —
- **Touches:** `src/main/config-store.ts`
- **Description:** Extend `ConfigSchema` with `budgetWatches: BudgetWatch[]` and `budgetBreaches: BudgetBreach[]`. Add serialized CRUD functions: `getBudgetWatches`, `addBudgetWatch`, `removeBudgetWatch`, `updateBudgetWatch`, `getBudgetBreaches`, `addBudgetBreach`, `dismissBudgetBreach`, `pruneOldBreaches`. Add `budgetWatches` and `budgetBreaches` to store defaults.

## Task 3: Register budget IPC handlers in main process

- **Agent:** default
- **Tier:** 2
- **Depends on:** 1, 2
- **Touches:** `src/main/index.ts`, `src/preload/index.ts`
- **Description:** Register `budget:getWatches`, `budget:addWatch`, `budget:removeWatch`, `budget:updateWatch`, `budget:getBreaches`, `budget:dismissBreach` IPC handlers. Wire the preload bridge to call these handlers. Import the config-store budget functions.

## Task 4: Add IBudgetService and implementations

- **Agent:** default
- **Tier:** 2
- **Depends on:** 1
- **Touches:** `src/renderer/src/services/interfaces.ts`, `src/renderer/src/services/impl/BudgetService.ts`, `src/renderer/src/services/mock/MockServices.ts`, `src/renderer/src/services/container.ts`
- **Description:** Define `IBudgetService` interface. Implement `BudgetService` (real) that calls `window.api.budget.*` methods. Implement `MockBudgetService` with in-memory storage. Register both in `container.ts`. Also expose `pauseLoop(env, loopId)` method that calls `POST /api/loops/:id/pause` via the API service.

## Task 5: Add useBudgetWatch hook + i18n keys

- **Agent:** default
- **Tier:** 2
- **Depends on:** 4
- **Touches:** `src/renderer/src/use-budget-watch.ts`, `src/renderer/src/i18n/en.json`
- **Description:** Create `useBudgetWatch` hook that:
  - Loads watches from `IBudgetService`
  - On every poll cycle (receives `perEnvLoops` as input), checks each enabled watch against current `runsToday()` counts
  - Tracks already-fired breaches in a `Set<string>` keyed by `${watchId}:${loopId}:${dateKey}`
  - On breach: calls `IBudgetService.pauseLoop` if autoPause, adds breach via service, fires OS notification
  - Returns `{ watches, breaches, addWatch, removeWatch, toggleWatch, dismissBreach, resumeLoop }`
  Add all i18n keys under `budget.*` namespace.

## Task 6: BudgetWatchPanel + BreachInbox components

- **Agent:** default
- **Tier:** 2
- **Depends on:** 5
- **Touches:** `src/renderer/src/components/BudgetWatchPanel.tsx`, `src/renderer/src/components/BreachInbox.tsx`, `src/renderer/src/theme.css`
- **Description:** Build `BudgetWatchPanel` — shows existing watches as compact rows with delete/toggle, and a form to add new watches (scope selector, loop ID for loop-scope, threshold number, auto-pause toggle). Build `BreachInbox` — shows undismissed breaches with dismiss + optional resume button. Add CSS for both components matching the existing dark theme.

## Task 7: Wire budget watch into App + LoopDetail

- **Agent:** default
- **Tier:** 2
- **Depends on:** 5, 6
- **Touches:** `src/renderer/src/App.tsx`, `src/renderer/src/components/LoopDetail.tsx`
- **Description:** In `App.tsx`: instantiate `useBudgetWatch` with `perEnvLoops`, wire breach notifications to the existing notification bridge. Render `BreachInbox` in the sidebar. In `LoopDetail.tsx`: add a "⏱ Budget" button in the card header that opens `BudgetWatchPanel`.

## Verification

- `pnpm typecheck` must pass (no new errors)
- `pnpm dev:web` runs with mock data, budget watch feature visible
