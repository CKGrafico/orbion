# Tasks — gh-307-log-write-safe-handle

- [ ] 1.1 Add `log:write` validator, module allowlist, and rate limiter to `ipc-validation.ts` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/ipc-validation.ts] -->
- [ ] 1.2 Migrate `log:write` handler from `ipcMain.handle` to `safeHandle` + `validateIpc` in `index.ts` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/index.ts] -->
- [ ] 1.3 Remove redundant `isLogEntry` function and `LOG_LEVELS`/`SENSITIVE_LOG_CONTEXT_KEY` constants from `index.ts` <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/main/index.ts] -->
- [ ] 2.1 Add unit tests for `log:write` validator (valid, invalid, module allowlist, prefix rule) <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [tests/ipc-validation.test.ts] -->
- [ ] 2.2 Add unit tests for rate limiter (under limit, over limit, token refill) <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [tests/ipc-validation.test.ts] -->
- [ ] 3.1 Run `pnpm typecheck` and fix any errors <!-- agent: frontend-engineer.build, depends_on: [1.3, 2.1, 2.2], touches: [] -->
