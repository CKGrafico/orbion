# Tasks: Loop summary bar under the chat header

## Change ID

gh-102-loop-summary-bar

### Task 1: Extend LoopStatus type, STATUS_COLORS, and CSS variables

- **Tier**: 1
- **Agent**: frontend-engineer
- **Depends on**: —
- **Touches**: `src/renderer/src/types.ts`, `src/renderer/src/format.ts`, `src/renderer/src/theme.css`, `src/renderer/src/fleet-mapping.ts`
- **Description**: Add `"failed"` and `"finished"` to `LoopStatus`, add corresponding `STATUS_COLORS` entries and CSS custom properties (`--status-failed`, `--status-finished`). Update `loopStatusToFleetItem` to map `failed` → `"failed"` and `finished` → `"completed"`.
- **Verification**: `pnpm typecheck` passes.

### Task 2: Create useNextRunCountdown hook

- **Tier**: 1
- **Agent**: frontend-engineer
- **Depends on**: —
- **Touches**: `src/renderer/src/components/useNextRunCountdown.ts` (new)
- **Description**: Pure hook that takes an ISO date string and returns a human-readable countdown label (`"4m"`, `"1h30m"`, etc.), updating every 10 seconds. Returns null when the date is null or in the past.
- **Verification**: `pnpm typecheck` passes.

### Task 3: Create LoopSummaryBar component

- **Tier**: 2
- **Agent**: frontend-engineer
- **Depends on**: Task 1, Task 2
- **Touches**: `src/renderer/src/components/LoopSummaryBar.tsx` (new), `src/renderer/src/i18n/en.json`, `src/renderer/src/theme.css`
- **Description**: Pure-presentational component. Accepts `loops: LoopMeta[]` and `reachability`. Renders healthy count as collapsed number, exception segments with colored dots, next-run countdown on the right, empty-state nudge when zero loops, and muted unknown state when unreachable. All strings via i18n keys.
- **Verification**: `pnpm typecheck` passes.

### Task 4: Wire bar into SessionChatView and scope loops in App.tsx

- **Tier**: 2
- **Agent**: frontend-engineer
- **Depends on**: Task 3
- **Touches**: `src/renderer/src/components/SessionChatView.tsx`, `src/renderer/src/App.tsx`
- **Description**: Add `loops` prop to `SessionChatView`, render `LoopSummaryBar` after the unreachable banner. In `App.tsx`, scope `perEnvLoops` to the session's project before passing to the component.
- **Verification**: `pnpm typecheck` passes.

### Task 5: Add mock loops with failed/finished/paused states

- **Tier**: 1
- **Agent**: frontend-engineer
- **Depends on**: Task 1
- **Touches**: `src/renderer/src/services/mock/MockServices.ts`
- **Description**: Add mock loops with statuses `failed`, `finished`, and `paused` so the loop summary bar shows realistic exception data in mock mode.
- **Verification**: `pnpm dev:web` renders the bar with exception segments.
