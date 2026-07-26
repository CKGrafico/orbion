## Context

`closeTunnel` and `closeAllTunnels` in `src/main/ssh-tunnel.ts` send SIGTERM, then schedule a `killTimer` (2s) that sends SIGKILL if the process hasn't exited. The `proc.on("exit")` handler clears the timer and removes the handle from `activeTunnels`. However, Node.js event loop scheduling allows the timer callback to fire between process exit and the exit handler's execution, causing a SIGKILL attempt on an already-exiting process.

Current cleanup flow:
1. `closeTunnel` sets `intentionalClose = true`, sends SIGTERM, schedules `killTimer`
2. Process exits → exit handler clears `killTimer`, deletes from `activeTunnels`
3. If timer fires before exit handler: timer callback checks `exitCode === null` (may still be null briefly), sends SIGKILL → redundant kill on exiting process

## Goals / Non-Goals

**Goals:**
- Eliminate the race window between killTimer fire and exit handler cleanup
- Ensure SIGKILL fallback only fires on handles still tracked in `activeTunnels`
- Preserve existing intentional exit / force-kill behavior unchanged

**Non-Goals:**
- Refactoring the tunnel lifecycle beyond the race condition fix
- Changing the SIGKILL timeout duration
- Adding new IPC channels or renderer-facing changes

## Decisions

**D1: Guard timer callback with `activeTunnels.has(tunnelId)` check**

In both `closeTunnel` and `closeAllTunnels`, before sending SIGKILL in the timer callback, verify the handle is still in `activeTunnels`. If the exit handler already ran and removed it, the timer callback becomes a no-op.

Alternative considered: set a boolean flag on the handle (e.g. `handle.exited = true`) in the exit handler. Rejected because the flag lives on the same object the timer already references — if exit handler already deleted the handle from the map, the flag is orphaned. The `activeTunnels.has()` check uses the authoritative single source of truth.

Alternative considered: use `process.exitCode !== null` check alone. Already present but insufficient — exitCode may not be set yet when timer fires in the race window.

## Risks / Trade-offs

- [Timer fires late after delete] → No-op: `activeTunnels.has()` returns false. No SIGKILL sent. Safe.
- [Timer fires before exit handler] → `activeTunnels.has()` still true, `exitCode` still null. SIGKILL sent as intended. This is the desired fallback behavior when the process genuinely won't exit.
