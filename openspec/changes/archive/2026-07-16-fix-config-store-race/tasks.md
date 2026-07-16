# Tasks

- [ ] 1.1 Add `serialize()` helper and `writeChain` to config-store.ts <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/config-store.ts] -->
- [ ] 1.2 Wrap all mutating functions with serialize() and convert to async <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/config-store.ts] -->
- [ ] 1.3 Make ensureMigrated() async and update read functions that call it <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/config-store.ts] -->
- [ ] 2.1 Update callers in index.ts for async signatures <!-- agent: frontend-engineer.build, depends_on: [1.2, 1.3], touches: [src/main/index.ts] -->
- [ ] 2.2 Update callers in connection-supervisor.ts for async signatures <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/main/connection-supervisor.ts] -->
- [ ] 2.3 Update callers in vm-wizard.ts for async signatures <!-- agent: frontend-engineer.build, depends_on: [1.2, 1.3], touches: [src/main/vm-wizard.ts] -->
- [ ] 3.1 Run typecheck and verify no compilation errors <!-- agent: frontend-engineer.fast, depends_on: [2.1, 2.2, 2.3], touches: [] -->
