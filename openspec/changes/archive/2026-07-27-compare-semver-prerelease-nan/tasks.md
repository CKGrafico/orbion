## 1. Core fix

- [ ] 1.1 Fix `compareSemver` to strip pre-release/build metadata and handle NaN segments <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/utils.ts] -->

## 2. Tests

- [ ] 2.1 Add unit tests for `compareSemver` covering pre-release, build metadata, v-prefix, short versions, and NaN edge cases <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [tests/compare-semver.test.ts] -->

## 3. Verification

- [ ] 3.1 Run `rtk proxy pnpm typecheck`, `rtk proxy pnpm test`, and `rtk proxy pnpm build` — all must pass <!-- agent: frontend-engineer.fast, depends_on: [1.1, 2.1], touches: [] -->
