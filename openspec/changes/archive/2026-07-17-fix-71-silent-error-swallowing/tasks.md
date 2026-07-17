# Tasks

- [ ] 1.1 Fix serialize() in config-store.ts: log errors and propagate to caller <!-- agent: fullstack-engineer.build, depends_on: [], touches: [src/main/config-store.ts] -->
- [ ] 1.2 Fix bounds persistence in index.ts: add console.warn in catch blocks <!-- agent: fullstack-engineer.fast, depends_on: [], touches: [src/main/index.ts] -->
- [ ] 1.3 Fix connection-supervisor.ts: preserve original error as .cause <!-- agent: fullstack-engineer.fast, depends_on: [], touches: [src/main/connection-supervisor.ts] -->
- [ ] 1.4 Fix renderer store.ts: surface config failures to user via notification <!-- agent: fullstack-engineer.build, depends_on: [], touches: [src/renderer/src/store.ts] -->
- [ ] 2.1 Verify TypeScript compilation passes <!-- agent: fullstack-engineer.fast, depends_on: [1.1, 1.2, 1.3, 1.4], touches: [] -->
