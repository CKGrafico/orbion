## 1. Canonical SSRF module

- [x] 1.1 Create `src/main/ssrf-allowlist.ts` with `isUrlAllowedForFetch(url, options?)` function implementing allowlist polarity, IPv6 link-local blocking, cloud DNS metadata hostname blocking, and all existing SSRF vectors <!-- agent: fullstack-engineer.build, depends_on: [], touches: [src/main/ssrf-allowlist.ts] -->

## 2. Refactor consumers

- [x] 2.1 Replace `isBlocklistedHost` in `src/main/ipc-validation.ts` with import from `ssrf-allowlist.ts`, delete the private function <!-- agent: fullstack-engineer.build, depends_on: [1.1], touches: [src/main/ipc-validation.ts] -->
- [x] 2.2 Replace `isAllowedHost` in `src/main/index.ts` with import from `ssrf-allowlist.ts`, keep `isAllowedBaseUrl` and `isEffectiveUrlAllowed` as thin wrappers <!-- agent: fullstack-engineer.build, depends_on: [1.1], touches: [src/main/index.ts] -->

## 3. Tests

- [x] 3.1 Rewrite `tests/host-blocklist.test.ts` to import from `ssrf-allowlist.ts` and add test cases for IPv6 link-local, cloud DNS metadata hostnames, and both polarity paths <!-- agent: fullstack-engineer.build, depends_on: [1.1], touches: [tests/host-blocklist.test.ts] -->
- [x] 3.2 Add IPv6 link-local and DNS metadata rejection test cases to `tests/ipc-validation.test.ts` <!-- agent: fullstack-engineer.build, depends_on: [2.1], touches: [tests/ipc-validation.test.ts] -->

## 4. Verification

- [x] 4.1 Run `pnpm typecheck` and `pnpm check:comments`, fix any errors <!-- agent: fullstack-engineer.fast, depends_on: [2.1, 2.2, 3.1, 3.2], touches: [] -->
