# Tasks

- [ ] 1.1 Add MAX_BODY_SIZE constant and body validation to api:request IPC validator <!-- agent: fullstack-engineer.build, depends_on: [], touches: [src/main/ipc-validation.ts] -->
- [ ] 1.2 Add defense-in-depth MAX_BODY_SIZE guard in fetchAndUnwrap <!-- agent: fullstack-engineer.build, depends_on: [], touches: [src/main/http-utils.ts] -->
- [ ] 2.1 Add Vitest tests for body size validation <!-- agent: fullstack-engineer.build, depends_on: [1.1], touches: [tests/ipc-validation.test.ts] -->
- [ ] 3.1 Run typecheck and verify tests pass <!-- agent: fullstack-engineer.fast, depends_on: [1.1, 1.2, 2.1], touches: [] -->
