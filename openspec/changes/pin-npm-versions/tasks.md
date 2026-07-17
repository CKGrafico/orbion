## 1. Pin npm package versions

- [ ] 1.1 Replace `version: "latest"` with pinned version `"0.0.0"` for `openCode`, `jira`, and `gitlab` entries in `NPM_PACKAGES` in `src/main/verified-install.ts`; update JSDoc comments to explain the placeholder <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/main/verified-install.ts] -->

## 2. Runtime guard

- [ ] 2.1 Add `validateNpmPackages()` function that throws if any `NPM_PACKAGES` entry has `version: "latest"`; invoke it at module level after `NPM_PACKAGES` declaration in `src/main/verified-install.ts` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/verified-install.ts] -->

## 3. Unit test

- [ ] 3.1 Create `src/main/__tests__/verified-install.test.ts` with a test that asserts no entry in `NPM_PACKAGES` has `version: "latest"` <!-- agent: frontend-engineer.fast, depends_on: [2.1], touches: [src/main/__tests__/verified-install.test.ts] -->

## 4. Verify

- [ ] 4.1 Run `pnpm typecheck` and `pnpm test` to confirm no regressions <!-- agent: frontend-engineer.fast, depends_on: [3.1], touches: [] -->
