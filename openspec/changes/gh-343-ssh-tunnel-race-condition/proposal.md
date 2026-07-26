## Why

`closeTunnel` and `closeAllTunnels` in `src/main/ssh-tunnel.ts` schedule a `killTimer` (SIGKILL fallback) after sending SIGTERM. The exit handler clears this timer, but there is a window where the timer callback can fire between the process exiting and the exit handler running. If the timer fires in this gap, it attempts `SIGKILL` on an already-exiting or exited process, causing double-cleanup attempts, log noise, and potential state inconsistencies in tunnel state management.

## What Changes

- Add a guard in the `killTimer` callback in `closeTunnel` and `closeAllTunnels` that checks whether the tunnel handle is still present in `activeTunnels` before sending `SIGKILL`. If the exit handler has already removed the handle, the timer callback becomes a no-op.
- Update the mirrored test logic in `tests/ssh-tunnel-kill.test.ts` to cover the race-guard scenario.

## Capabilities

### New Capabilities

- `ssh-tunnel-race-guard`: Prevents the SIGKILL fallback timer from acting on already-cleaned-up tunnel handles.

### Modified Capabilities

## Impact

- `src/main/ssh-tunnel.ts`: `closeTunnel` and `closeAllTunnels` timer callbacks gain an `activeTunnels.has()` guard.
- `tests/ssh-tunnel-kill.test.ts`: New test case for the race-guard scenario.
