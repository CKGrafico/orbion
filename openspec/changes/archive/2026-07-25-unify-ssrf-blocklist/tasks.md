# Tasks

- [x] T1: Create `src/main/ssrf-blocklist.ts` with `isHostAllowed`, `isUrlAllowedForFetch`, `isAllowedBaseUrl`
- [x] T2: Refactor `ipc-validation.ts` — replace `isBlocklistedHost` with import from `ssrf-blocklist`
- [x] T3: Refactor `index.ts` — replace `isAllowedHost`, `isAllowedBaseUrl` with imports from `ssrf-blocklist`
- [x] T4: Add `metadata.azure.internal` to cloud metadata hostnames
- [x] T5: Improve IPv6 link-local detection (bracket-aware helper)
- [x] T6: Extract `isAllowedBaseUrl` into canonical module
- [x] T7: Rewrite `tests/host-blocklist.test.ts` with comprehensive coverage
- [x] T8: Add parity test verifying both call paths agree on allow/deny
- [x] T9: Run `pnpm typecheck`, `pnpm check:comments`, `pnpm test`
