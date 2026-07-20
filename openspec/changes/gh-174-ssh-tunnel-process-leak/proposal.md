# gh-174: SSH tunnel child processes leak on unclean app exit

## Summary

SSH tunnel subsystem (`src/main/ssh-tunnel.ts`) spawns `ssh` child processes tracked in `activeTunnels`. While `closeAllRegistryTunnels()` is called in the `window-all-closed` handler, gaps remain:

1. **No `before-quit` handler**: On macOS the app stays alive after windows close. A user can Cmd+Q, triggering `before-quit` but not re-entering `window-all-closed`. Tunnels persist.
2. **No `process.on("exit")` last-resort**: If the process crashes or is force-killed, no synchronous cleanup runs. SSH processes orphan.
3. **No SIGKILL fallback**: `closeTunnel()` and `closeAllTunnels()` send SIGTERM only. If ssh ignores it (stuck I/O, unresponsive), the process lingers indefinitely.

## Impact

- Zombie SSH processes hold local ports and maintain authenticated tunnels to remote VMs with no oversight.
- Silent security surface: orphaned tunnels forward local-to-remote ports without UI indicator.
- Port exhaustion after repeated crashes prevents new tunnel creation.

## Scope

- `src/main/ssh-tunnel.ts`: Add SIGKILL fallback with 2s timeout to `closeTunnel()` and `closeAllTunnels()`. Export a synchronous `forceKillAllTunnels()` for `process.on("exit")`.
- `src/main/index.ts`: Add `before-quit` handler calling `closeAllRegistryTunnels()`. Add `process.on("exit")` calling `forceKillAllTunnels()` as synchronous last-resort.
- `tests/ssh-tunnel-kill.test.ts`: Unit tests verifying SIGKILL fallback and synchronous force-kill.

## Out of Scope

- Renderer changes (no user-visible UI).
- New IPC channels.
- Changes to tunnel-registry reconnect logic.
