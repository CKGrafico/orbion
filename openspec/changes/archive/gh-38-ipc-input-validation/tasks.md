# Tasks — GH-38: IPC Input Validation

- [ ] 1.1 Create `src/main/ipc-validation.ts` with validation utility and per-channel schemas <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/ipc-validation.ts] -->
- [ ] 1.2 Add `validateIpc` to every IPC handler in `src/main/index.ts` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/index.ts] -->
- [ ] 2.1 Run typecheck and fix any errors <!-- agent: frontend-engineer.fast, depends_on: [1.2], touches: [] -->
