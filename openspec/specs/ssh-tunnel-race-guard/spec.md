# ssh-tunnel-race-guard Specification

## Purpose
TBD - created by archiving change gh-343-ssh-tunnel-race-condition. Update Purpose after archive.
## Requirements
### Requirement: SIGKILL fallback timer must check activeTunnels membership

The `killTimer` callback in `closeTunnel` and `closeAllTunnels` SHALL verify the tunnel handle is still present in `activeTunnels` before sending SIGKILL. If the exit handler has already removed the handle, the timer callback SHALL be a no-op.

#### Scenario: Timer fires after exit handler cleaned up
- **WHEN** `closeTunnel` sends SIGTERM and schedules killTimer, the process exits, and the exit handler removes the handle from `activeTunnels`
- **THEN** the killTimer callback SHALL NOT send SIGKILL and SHALL NOT throw

#### Scenario: Timer fires before exit handler
- **WHEN** `closeTunnel` sends SIGTERM and schedules killTimer, and the process has not exited after SIGKILL_TIMEOUT_MS
- **THEN** the killTimer callback SHALL send SIGKILL as the existing fallback behavior

#### Scenario: closeAllTunnels race guard
- **WHEN** `closeAllTunnels` sends SIGTERM to all tunnels and the exit handler removes one tunnel's handle before its killTimer fires
- **THEN** that tunnel's killTimer callback SHALL NOT send SIGKILL on the already-exited process

