# ssh-tunnel-race-guard Specification

## Purpose
Prevent TOCTOU races in SSH tunnel SIGKILL fallback timers and ensure deterministic shutdown of tunnel processes.
## Requirements
### Requirement: SIGKILL fallback timer must use exitCode guard without map membership check

The `killTimer` callback in `closeTunnel` and `closeAllTunnels` SHALL check `handle.process.exitCode === null` directly instead of `activeTunnels.has(id)`. The `killed` flag on `TunnelHandle` is set to `true` when a close is initiated, removing the need to check map membership in the timer closure.

#### Scenario: Timer fires after exit handler cleaned up
- **WHEN** `closeTunnel` sets `handle.killed = true`, sends SIGTERM, and schedules killTimer, the process exits, and the exit handler removes the handle from `activeTunnels`
- **THEN** the killTimer callback SHALL NOT send SIGKILL because `handle.process.exitCode` is no longer `null`

#### Scenario: Timer fires before exit handler
- **WHEN** `closeTunnel` sets `handle.killed = true`, sends SIGTERM, and schedules killTimer, and the process has not exited after SIGKILL_TIMEOUT_MS
- **THEN** the killTimer callback SHALL send SIGKILL because `handle.process.exitCode` is still `null`

#### Scenario: closeAllTunnels race guard
- **WHEN** `closeAllTunnels` sends SIGTERM to all tunnels and the exit handler removes one tunnel's handle before its killTimer fires
- **THEN** that tunnel's killTimer callback SHALL NOT send SIGKILL on the already-exited process

### Requirement: closeAllTunnels must await process exits

`closeAllTunnels()` SHALL return `Promise<void>` that resolves when all tracked tunnel processes have exited, or after a hard timeout of 5 seconds. This ensures deterministic shutdown when called from app quit handlers.

#### Scenario: All tunnels exit quickly after SIGTERM
- **WHEN** closeAllTunnels sends SIGTERM to all tunnels and all exit within SIGKILL_TIMEOUT_MS
- **THEN** the returned promise resolves after all exit events fire

#### Scenario: Some tunnels require SIGKILL
- **WHEN** closeAllTunnels sends SIGTERM and one tunnel does not exit within SIGKILL_TIMEOUT_MS
- **THEN** the SIGKILL fallback fires, the process exits, and the promise resolves

#### Scenario: Hard timeout for unresponsive processes
- **WHEN** closeAllTunnels is called and a process does not exit even after SIGKILL within 5 seconds
- **THEN** the promise resolves anyway to avoid hanging app shutdown
