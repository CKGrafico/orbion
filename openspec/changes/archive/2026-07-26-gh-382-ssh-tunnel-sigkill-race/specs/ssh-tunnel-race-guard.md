# Delta spec: SSH tunnel SIGKILL race fix

## Changes to ssh-tunnel-race-guard

### Requirement: SIGKILL fallback timer must use killed flag instead of map membership

The `killTimer` callback in `closeTunnel` and `closeAllTunnels` SHALL check `handle.killed` (a boolean on the TunnelHandle) instead of `activeTunnels.has(id)`. The `killed` flag is set to `true` immediately before scheduling the SIGKILL timer, so the closure always has access to it even after the exit handler deletes the handle from the map.

#### Scenario: Timer fires after exit handler cleaned up
- **WHEN** closeTunnel sets `handle.killed = true`, sends SIGTERM, and schedules killTimer, the process exits and the exit handler removes the handle from `activeTunnels`
- **THEN** the killTimer callback SHALL check `handle.killed` (still `true`) — since exit already happened, `handle.process.exitCode` will not be `null`, so SIGKILL is not sent

#### Scenario: Timer fires before exit handler, process won't exit
- **WHEN** closeTunnel sets `handle.killed = true`, sends SIGTERM, and after SIGKILL_TIMEOUT_MS the process has not exited
- **THEN** the killTimer callback SHALL see `handle.killed === true` (was set at SIGTERM time) and `handle.process.exitCode === null`, so it sends SIGKILL

Note: The `killed` flag replaces the `activeTunnels.has(id)` check. It is not used to *prevent* SIGKILL — it indicates that SIGTERM was already sent, making this a tracked close. The actual guard against double-kill remains `handle.process.exitCode === null`.

### Requirement: closeAllTunnels must await process exits

`closeAllTunnels()` SHALL return `Promise<void>` that resolves when all tracked tunnel processes have exited, or after a hard timeout of 5 seconds. This ensures deterministic shutdown when called from app quit handlers.

#### Scenario: All tunnels exit quickly after SIGTERM
- **WHEN** closeAllTunnels sends SIGTERM to 3 tunnels and all exit within SIGKILL_TIMEOUT_MS
- **THEN** the returned promise resolves after all 3 exit events fire

#### Scenario: Some tunnels require SIGKILL
- **WHEN** closeAllTunnels sends SIGTERM and one tunnel does not exit within SIGKILL_TIMEOUT_MS
- **THEN** the SIGKILL fallback fires, the process exits, and the promise resolves

#### Scenario: Hard timeout for unresponsive processes
- **WHEN** closeAllTunnels is called and a process does not exit even after SIGKILL within 5 seconds
- **THEN** the promise resolves anyway to avoid hanging app shutdown
