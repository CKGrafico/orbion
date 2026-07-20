# Design: SSH Tunnel Process Leak Fix

## Approach

### 1. SIGKILL fallback in ssh-tunnel.ts

Current `closeTunnel()` and `closeAllTunnels()` call `process.kill()` (SIGTERM) and immediately delete from `activeTunnels`. If SSH doesn't exit, the process leaks.

**Change**: After SIGTERM, start a 2s `setTimeout`. If the process hasn't emitted `exit` by then, send `SIGKILL`. The `exit` handler already clears `activeTunnels`, so no double-delete risk.

Implementation:
- `closeTunnel(tunnelId)`: set `intentionalClose = true`, send SIGTERM, schedule SIGKILL fallback.
- `closeAllTunnels()`: iterate all handles, SIGTERM each, schedule SIGKILL fallback per handle.
- New `forceKillAllTunnels()`: synchronous, sends SIGKILL immediately to every tracked process. Used only from `process.on("exit")` where async timers won't fire.

### 2. before-quit handler in index.ts

Register `app.on("before-quit", () => closeAllRegistryTunnels())`. This covers:
- macOS Cmd+Q (fires before-quit, then quits).
- Any programmatic `app.quit()` from other code paths.

The `window-all-closed` handler already calls `closeAllRegistryTunnels()` on non-macOS. Adding `before-quit` is idempotent: the function is safe to call repeatedly.

### 3. process.on("exit") synchronous force-kill

Register `process.on("exit", forceKillAllTunnels)`. This runs synchronously at process exit. Since `setTimeout`/async won't fire, we bypass the SIGTERM+wait logic and go straight to SIGKILL. This is the last-resort safety net for crashes.

### 4. Unit tests

Test file: `tests/ssh-tunnel-kill.test.ts`

Tests are pure-logic (mirroring the existing pattern in `tests/tunnel-reconnect.test.ts`):
- Verify SIGKILL is scheduled after SIGTERM when process doesn't exit.
- Verify SIGKILL timer is cancelled when process exits on its own after SIGTERM.
- Verify `forceKillAllTunnels()` sends SIGKILL to all tracked processes synchronously.

## Tradeoffs

- 2s SIGKILL timeout: too short and SSH may not have cleaned up; too long and the leak window is larger. 2s is standard for graceful shutdown.
- `process.on("exit")` with synchronous SIGKILL: harsh but correct. At process exit, there's no event loop; we must kill immediately or leak.
