# gh-136: Budget watch on run volume, with optional auto-pause

## Summary

Add a **budget watch** mechanism that monitors runs-per-day for individual loops or
fleet-wide. When a threshold is breached, an inbox notification + OS notification is
created naming the offending loop(s). Optionally, the watch can **auto-pause** the
offending loop(s) via the daemon's `POST /api/loops/:id/pause` endpoint. Auto-pause
is always opt-in, never default; resume is one action away.

This builds on the existing notification infrastructure (`use-notifications.ts`,
`fleet-status.ts`) and loop data that Orbion already polls every 5 seconds. Run
counts come from `runHistory` — data Orbion already has.

## Acceptance criteria

1. A budget watch can be set on **runs-per-day** for a specific loop (by ID) or
   fleet-wide (across all environments).
2. On breach, an **OS notification** fires naming the loop(s) that exceeded the
   threshold, and an **inbox item** is created.
3. Budget watches accept an **opt-in auto-pause flag**; on breach the loop is paused
   via `POST /api/loops/:id/pause` and the notification says so. Opt-in only, never
   default; resume is one action away (via the loop card or chat).
4. Watches are persisted locally (survive app restart); stored in `electron-store`
   via a new config key (`budgetWatches`).
5. Mock adapter still works (`pnpm dev:web`).

## Design

### Data model

```typescript
interface BudgetWatch {
  id: string;               // crypto.randomUUID
  scope: "loop" | "fleet";  // loop = specific loop, fleet = all environments
  loopId?: string;          // required when scope = "loop"
  environmentId?: string;   // required when scope = "loop" — which instance
  threshold: number;        // max runs per day
  autoPause: boolean;       // opt-in, default false
  enabled: boolean;         // can be toggled off without deleting
  createdAt: string;        // ISO timestamp
}

interface BudgetBreach {
  watchId: string;
  loopId: string;
  environmentId: string;
  environmentName: string;
  loopDescription: string;
  runsToday: number;
  threshold: number;
  autoPaused: boolean;
  breachedAt: string;       // ISO timestamp
}
```

### Data flow

- Budget watches are persisted in `electron-store` under `budgetWatches` key.
  The main process manages CRUD via new IPC channels.
- The **renderer** checks watches against the already-polled loop data every
  poll cycle (5s). This is a pure computation: for each watch, compare
  `runsToday(loop.runHistory)` against the threshold.
- Breach detection is **idempotent**: once a watch fires for a given loop on a
  given day, it is not re-fired until the next day resets the run counter.
  A `Set<string>` of `${watchId}:${loopId}:${dateKey}` tracks already-fired breaches.
- On breach:
  1. If `autoPause` is true, call `POST /api/loops/:id/pause` via `apiRequest`.
  2. Fire an OS notification via the existing `NotificationBridge`.
  3. Add an inbox item to the `BudgetBreach` list (also persisted).

### New IPC channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `budget:getWatches` | main→renderer | Return all budget watches |
| `budget:addWatch` | renderer→main | Create a new watch |
| `budget:removeWatch` | renderer→main | Delete a watch |
| `budget:updateWatch` | renderer→main | Toggle enabled / edit |
| `budget:getBreaches` | main→renderer | Return un-dismissed breaches |
| `budget:dismissBreach` | renderer→main | Dismiss a breach |

### UI surfaces

1. **BudgetWatchPanel** — a new component (modal-like card) accessible from the
   loop detail view (a "⏱ Budget" action in the loop card header) and from a
   new "Budget watches" section in the sidebar settings area. Shows existing
   watches in a compact list and a form to add new ones.

2. **Breach notification** — uses the existing OS notification system. The body
   names the loop(s) and says "auto-paused" if applicable.

3. **Breach inbox** — a compact section in the sidebar showing undismissed
   breaches. Each breach shows the loop name, run count vs threshold, and a
   "Resume" button if auto-paused.

### No new daemon endpoints

All data comes from the existing `runHistory` field on loop objects already
polled every 5s. The only daemon mutation is `POST /api/loops/:id/pause` which
is an existing loop-task endpoint.

### Files touched

| File | Change |
|------|--------|
| `src/shared/ipc.ts` | Add `BudgetWatch`, `BudgetBreach` types, `BudgetBridge` to `LoopTaskBridge` |
| `src/preload/index.ts` | Add budget IPC bridge |
| `src/main/config-store.ts` | Add `budgetWatches` + `budgetBreaches` to store schema, CRUD helpers |
| `src/main/index.ts` | Register budget IPC handlers |
| `src/renderer/src/types.ts` | Re-export budget types from shared |
| `src/renderer/src/services/interfaces.ts` | Add `IBudgetService` |
| `src/renderer/src/services/impl/BudgetService.ts` | New: implements CRUD + breach check |
| `src/renderer/src/services/impl/ApiStreamTailscale.ts` | No change (reuse apiRequest for pause) |
| `src/renderer/src/services/mock/MockServices.ts` | Add `MockBudgetService` |
| `src/renderer/src/services/container.ts` | Register `IBudgetService` |
| `src/renderer/src/use-budget-watch.ts` | New: hook that runs breach checks on poll cycle |
| `src/renderer/src/components/BudgetWatchPanel.tsx` | New: watch list + add form |
| `src/renderer/src/components/BreachInbox.tsx` | New: compact breach list with dismiss/resume |
| `src/renderer/src/components/LoopDetail.tsx` | Add "⏱ Budget" button in header |
| `src/renderer/src/App.tsx` | Wire `useBudgetWatch`, add breach notifications |
| `src/renderer/src/theme.css` | Budget-specific styles |
| `src/renderer/src/i18n/en.json` | i18n keys for budget UI |
