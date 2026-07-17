# Tasks

- [ ] 1.1 Harden `isAllowedPath()` in `ipc-validation.ts` — add `/api/` prefix, decode+check, reject encoded dots, length limit <!-- agent: fullstack-engineer.build, depends_on: [], touches: [src/main/ipc-validation.ts] -->
- [ ] 1.2 Update validator error messages to reflect `/api/` prefix requirement <!-- agent: fullstack-engineer.fast, depends_on: [1.1], touches: [src/main/ipc-validation.ts] -->
- [ ] 2.1 Remove duplicate inline path check in `handleApiRequest()` (index.ts:160-162) <!-- agent: fullstack-engineer.fast, depends_on: [1.1], touches: [src/main/index.ts] -->
- [ ] 3.1 Add comprehensive unit tests for `isAllowedPath()` in `tests/ipc-validation.test.ts` <!-- agent: fullstack-engineer.build, depends_on: [1.1], touches: [tests/ipc-validation.test.ts] -->
- [ ] 4.1 Run typecheck and tests to verify <!-- agent: fullstack-engineer.fast, depends_on: [1.1, 1.2, 2.1, 3.1], touches: [] -->
