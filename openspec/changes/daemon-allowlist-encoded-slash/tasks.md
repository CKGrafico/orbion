## 1. Allowlist guard

- [ ] 1.1 Add `%2f`/`%2F` rejection guard to `isAllowedApiOperation` and `isAllowedStreamPath` in `src/shared/daemon-allowlist.ts` <!-- agent: fullstack-engineer.build, depends_on: [], touches: [src/shared/daemon-allowlist.ts] -->

## 2. Tests

- [ ] 2.1 Flip the two encoded-slash tests in `src/shared/__tests__/daemon-allowlist.test.ts` from `toBe(true)` to `toBe(false)` and update test descriptions <!-- agent: fullstack-engineer.fast, depends_on: [1.1], touches: [src/shared/__tests__/daemon-allowlist.test.ts] -->
- [ ] 2.2 Add negative tests for encoded slashes in `isAllowedStreamPath` <!-- agent: fullstack-engineer.fast, depends_on: [1.1], touches: [src/shared/__tests__/daemon-allowlist.test.ts] -->

## 3. Verification

- [ ] 3.1 Run `rtk pnpm typecheck`, `rtk pnpm test`, `rtk pnpm build` and fix any failures <!-- agent: fullstack-engineer.fast, depends_on: [2.1, 2.2], touches: [] -->
