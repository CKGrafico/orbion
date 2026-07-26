## 1. Port validation guard

- [ ] 1.1 Export `assertSafePort` from `ssh-launch.ts` <!-- agent: fullstack-engineer.fast, depends_on: [], touches: [src/main/ssh-launch.ts] -->
- [ ] 1.2 Add `assertSafePort` guard in `startViaSsh()` before shell command construction, return `false` on failure <!-- agent: fullstack-engineer.fast, depends_on: [1.1], touches: [src/main/agent-runtime-recovery.ts] -->

## 2. Verification

- [ ] 2.1 Run `rtk pnpm typecheck` and `rtk pnpm build` — both must pass <!-- agent: fullstack-engineer.fast, depends_on: [1.2], touches: [] -->
