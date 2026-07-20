## 1. Documentation

- [x] 1.1 Add side-effect permanence invariant comment to the ephemeral-session discard-on-leave effect in `src/renderer/src/App.tsx` <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/renderer/src/App.tsx] -->

## 2. Regression Tests

- [x] 2.1 Create `tests/side-effect-permanence.test.ts` with regression test asserting that discarding a chat session does not affect loops on the daemon <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [tests/side-effect-permanence.test.ts] -->

## 3. Verification

- [x] 3.1 Run `pnpm typecheck` and `pnpm vitest` to verify no regressions <!-- agent: frontend-engineer.fast, depends_on: [2.1], touches: [] -->
