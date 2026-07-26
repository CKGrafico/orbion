# Tasks

## Task 1: Add killed flag to TunnelHandle and update SIGKILL timer guards

- **Files:** `src/main/ssh-tunnel.ts`
- **Agent:** fullstack-engineer
- **Tier:** build
- **Depends on:** none
- **Touches:** `src/main/ssh-tunnel.ts`

### Description

1. Add `killed: boolean` field to `TunnelHandle` interface (default `false`).
2. In `closeTunnel()`: set `handle.killed = true` before `handle.process.kill()`. Change SIGKILL timer guard from `activeTunnels.has(tunnelId)` to `!handle.killed` (though `killed` is always `true` in this path — the real guard remains `exitCode === null`; the flag makes the intent explicit and removes the TOCTOU map lookup).
3. Same in `closeAllTunnels()`.
4. In exit handler: the `clearTimeout(handle.killTimer)` already exists — keep it. The `activeTunnels.delete(tunnelId)` also stays.
5. Update `forceKillAllTunnels()`: no changes needed (synchronous, no timer).

## Task 2: Make closeAllTunnels async and await process exits

- **Files:** `src/main/ssh-tunnel.ts`
- **Agent:** fullstack-engineer
- **Tier:** build
- **Depends on:** Task 1
- **Touches:** `src/main/ssh-tunnel.ts`

### Description

1. Change `closeAllTunnels()` return type from `void` to `Promise<void>`.
2. Collect exit promises for each tunnel that received SIGTERM: wrap `handle.process` exit in a `Promise<void>` that resolves on the `'exit'` event.
3. Add a hard timeout (5 seconds) using `Promise.race` to avoid hanging on unresponsive processes.
4. Clear all kill timers before returning.
5. Update `closeAllRegistryTunnels()` in `tunnel-registry.ts` to be async and await the result.
6. Update `src/main/index.ts` quit handlers to handle the async close properly (use `await` in `before-quit` which supports async, or use callback pattern).

## Task 3: Update tests for killed flag and async closeAllTunnels

- **Files:** `tests/ssh-tunnel-kill.test.ts`
- **Agent:** fullstack-engineer
- **Tier:** build
- **Depends on:** Task 2
- **Touches:** `tests/ssh-tunnel-kill.test.ts`

### Description

1. Update mock `MockTunnelHandle` to include `killed: boolean`.
2. Update `closeTunnelLogic` and `closeAllTunnelsLogic` to set `killed = true` and check `!handle.killed` in timer callbacks.
3. Add tests for the async `closeAllTunnels` behavior (all exit quickly, some need SIGKILL, hard timeout).
4. Update existing "Race guard" test cases to use `killed` flag instead of map membership check.
