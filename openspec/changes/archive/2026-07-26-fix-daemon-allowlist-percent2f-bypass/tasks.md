# Tasks: Fix daemon-allowlist %2F regex bypass

## Task 1: Verify %2F block in isAllowedPath
- **agent**: fullstack-engineer
- **tier**: fast
- **depends_on**: none
- **touches**: src/main/ipc-validation.ts
- **done**: true (line 72 already has `/%2f/i.test(v)` check)

## Task 2: Verify test coverage for %2F bypass scenarios
- **agent**: fullstack-engineer
- **tier**: fast
- **depends_on**: 1
- **touches**: src/shared/__tests__/daemon-allowlist.test.ts, tests/ipc-validation.test.ts, src/main/__tests__/daemon-allowlist-ipc.test.ts
- **done**: true (tests exist for %2F, %2f, and valid paths without encoded slashes)

## Task 3: Run typecheck, test, build verification
- **agent**: fullstack-engineer
- **tier**: fast
- **depends_on**: 1, 2
- **touches**: none (CI verification only)
