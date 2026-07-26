# Fix SSH tunnel SIGKILL race condition in closeAllTunnels

## Summary

`closeAllTunnels()` has a TOCTOU race: the SIGKILL fallback timer checks `activeTunnels.has(id)` but the exit handler may have already deleted the entry. Also, `closeAllTunnels()` is fire-and-forget — tunnels may outlive the app on shutdown.

## Problem

1. **TOCTOU in SIGKILL timer** (closeTunnel + closeAllTunnels): `activeTunnels.has(id)` can return false because exit handler deleted it, but `handle.process.exitCode` may still be `null` in the gap. Risk of `ESRCH` or killing a reused PID.
2. **closeAllTunnels is async-fire-and-forget**: On app quit, `closeAllRegistryTunnels()` calls `closeAllTunnels()` but does not wait for processes to exit before `app.quit()` runs. Orphan SSH processes can outlive the app.

## Fix

1. Add `killed: boolean` to `TunnelHandle`. Set to `true` after SIGTERM in closeTunnel/closeAllTunnels.
2. In SIGKILL timer callbacks, check `!handle.killed` instead of `activeTunnels.has(id)`. The flag lives on the handle object (closure-captured), not on the map, so it survives map deletion.
3. Make `closeAllTunnels()` async: return `Promise<void>` that resolves when all tracked processes have exited (via exit-event promises + short timeout).

## Scope

- `src/main/ssh-tunnel.ts`: TunnelHandle interface + closeTunnel + closeAllTunnels + exit handler
- `src/main/tunnel-registry.ts`: `closeAllRegistryTunnels()` must await the new async `closeAllTunnels()`
- `src/main/index.ts`: `before-quit` and `window-all-closed` handlers must handle async close
- `tests/ssh-tunnel-kill.test.ts`: Update mock logic to use `killed` flag + test new async behavior
