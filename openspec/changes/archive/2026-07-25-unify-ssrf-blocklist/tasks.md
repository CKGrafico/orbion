# Tasks

- [x] T1: Create `src/main/ssrf-blocklist.ts` with `isHostAllowed` and `isUrlAllowedForFetch`
- [x] T2: Refactor `ipc-validation.ts` — replace `isBlocklistedHost` with import from `ssrf-blocklist`
- [x] T3: Refactor `index.ts` — replace `isAllowedHost` and `isAllowedBaseUrl` with imports from `ssrf-blocklist`
- [x] T4: Rewrite `tests/host-blocklist.test.ts` to import from `ssrf-blocklist` directly
- [x] T5: Add parity test verifying both call paths (IPC validation and fetch) agree on allow/deny
- [x] T6: Run `pnpm typecheck`, `pnpm check:comments`, `pnpm test`
