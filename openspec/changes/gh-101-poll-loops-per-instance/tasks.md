# Tasks: Poll loops per instance on a 5s interval

## Task 1: Replace selected-only loop polling with per-environment polling

**Tier**: 1  
**Touches**: `src/renderer/src/App.tsx`  
**Depends on**: —

### What

Replace the current `useEffect` that polls loops only for the **selected** environment with a new `useEffect` that:

1. On each 5s tick, iterates ALL environments.
2. For each environment whose `connectionStatus[envId].phase === "connected"`, calls `fetchLoops(env)`.
3. On success, updates `perEnvLoops[envId]`.
4. If the environment is also the currently selected one, also updates `loops` and `lastUpdated`.

### Details

- Remove the existing `// Fetch loops for the selected environment (polling every 5s)` effect (lines ~503-533).
- Add a new effect that:
  - Depends on `environments`, `connectionStatus` (serialized), and optionally the selected env id.
  - Uses a single `setInterval(5000)`.
  - On each tick, loops through all `environments` and fetches loops for those with `connectionStatus[env.id]?.phase === "connected"`.
  - Skips environments that are unreachable (`phase !== "connected"`).
  - Updates `perEnvLoops` with each successful result.
  - If `selectedId` matches the environment, also sets `loops` and `lastUpdated`.
- Similarly, replace the `// Fetch projects for the selected environment (polling every 10s)` effect with a per-environment version on a 10s cadence.
- Add an initial load that fires immediately for all connected environments on mount / when environments change.

### Verification

- `pnpm typecheck` passes
- Switching between environments in the UI shows loop data immediately (no cold-start delay)
- Sidebar fleet health rollup shows data for all connected environments
