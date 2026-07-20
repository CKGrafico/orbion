# Archive: gh-174-ssh-tunnel-process-leak

## Summary

Fixed SSH tunnel child process leaks on unclean app exit.

## Changes

- **src/main/ssh-tunnel.ts**: Added SIGKILL fallback (2s timeout after SIGTERM) to `closeTunnel()` and `closeAllTunnels()`. Added `forceKillAllTunnels()` for synchronous SIGKILL from `process.on("exit")`. Added `killTimer` field to `TunnelHandle` to track scheduled SIGKILL.
- **src/main/tunnel-registry.ts**: Added `forceKillAllRegistryTunnels()` that clears registry and delegates to `forceKillAllTunnels()`. Imported `forceKillAllTunnels` from ssh-tunnel.
- **src/main/index.ts**: Added `app.on("before-quit")` handler calling `closeAllRegistryTunnels()`. Added `process.on("exit")` handler calling `forceKillAllRegistryTunnels()`. Imported `forceKillAllRegistryTunnels`.
- **tests/ssh-tunnel-kill.test.ts**: 12 unit tests covering SIGKILL fallback, timer cancellation, force-kill, and exit handler integration model.

## Verification

- `pnpm typecheck`: No errors
- `pnpm vitest run tests/ssh-tunnel-kill.test.ts`: 12/12 passed
- `pnpm vitest run src/main/__tests__/tunnel-registry.test.ts`: all passed
- `pnpm vitest run tests/tunnel-reconnect.test.ts`: all passed
