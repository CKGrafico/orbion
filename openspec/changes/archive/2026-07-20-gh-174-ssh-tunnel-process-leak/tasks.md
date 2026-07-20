# Tasks: gh-174-ssh-tunnel-process-leak

- [ ] 1.1 Add SIGKILL fallback to `closeTunnel()` in ssh-tunnel.ts — after SIGTERM, schedule SIGKILL after 2s if process hasn't exited <!-- agent: fullstack-engineer.build, depends_on: [], touches: [src/main/ssh-tunnel.ts] -->
- [ ] 1.2 Add SIGKILL fallback to `closeAllTunnels()` in ssh-tunnel.ts — same pattern as 1.1 for each handle <!-- agent: fullstack-engineer.build, depends_on: [1.1], touches: [src/main/ssh-tunnel.ts] -->
- [ ] 1.3 Export `forceKillAllTunnels()` synchronous function in ssh-tunnel.ts — sends SIGKILL to all activeTunnels immediately, no timers <!-- agent: fullstack-engineer.build, depends_on: [], touches: [src/main/ssh-tunnel.ts] -->
- [ ] 2.1 Add `app.on("before-quit")` handler in index.ts calling `closeAllRegistryTunnels()` <!-- agent: fullstack-engineer.build, depends_on: [1.1], touches: [src/main/index.ts] -->
- [ ] 2.2 Add `process.on("exit")` handler in index.ts calling `forceKillAllTunnels()` as synchronous last-resort <!-- agent: fullstack-engineer.build, depends_on: [1.3, 2.1], touches: [src/main/index.ts] -->
- [ ] 3.1 Add unit tests in tests/ssh-tunnel-kill.test.ts — SIGKILL fallback, timer cancellation, forceKillAllTunnels <!-- agent: fullstack-engineer.build, depends_on: [1.3], touches: [tests/ssh-tunnel-kill.test.ts] -->
- [ ] 4.1 Run typecheck and fix any errors <!-- agent: fullstack-engineer.fast, depends_on: [2.2, 3.1], touches: [] -->
