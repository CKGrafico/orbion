## 1. Remove redundant wrapper

- [x] 1.1 Remove `isAllowedHost` wrapper in `src/main/index.ts`, replace call sites with direct `isUrlAllowedForFetch` calls <!-- agent: fullstack-engineer.build, depends_on: [], touches: [src/main/index.ts] -->

## 2. Cross-path consistency tests

- [x] 2.1 Add cross-path SSRF consistency test suite to `tests/host-blocklist.test.ts` verifying IPC and canonical agree on blocked and allowed hosts <!-- agent: fullstack-engineer.build, depends_on: [1.1], touches: [tests/host-blocklist.test.ts] -->

## 3. Verification

- [x] 3.1 Run `pnpm typecheck`, `pnpm check:comments`, and target tests <!-- agent: fullstack-engineer.fast, depends_on: [1.1, 2.1], touches: [] -->
