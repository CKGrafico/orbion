## 1. Fix race condition in ssh-tunnel.ts

- [ ] 1.1 Add `activeTunnels.has(tunnelId)` guard in `closeTunnel` killTimer callback <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/ssh-tunnel.ts] -->
- [ ] 1.2 Add `activeTunnels.has(id)` guard in `closeAllTunnels` killTimer callback <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/ssh-tunnel.ts] -->

## 2. Update tests

- [ ] 2.1 Add race-guard test case in ssh-tunnel-kill.test.ts for closeTunnel <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [tests/ssh-tunnel-kill.test.ts] -->
- [ ] 2.2 Add race-guard test case in ssh-tunnel-kill.test.ts for closeAllTunnels <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [tests/ssh-tunnel-kill.test.ts] -->

## 3. Verification

- [ ] 3.1 Run `pnpm typecheck` and `pnpm test` <!-- agent: frontend-engineer.fast, depends_on: [1.1, 1.2, 2.1, 2.2], touches: [] -->
