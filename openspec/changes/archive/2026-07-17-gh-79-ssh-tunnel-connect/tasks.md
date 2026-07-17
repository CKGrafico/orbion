# Tasks: gh-79-ssh-tunnel-connect

- [x] 1.1 Create tunnel-registry.ts with resolve/open/close/resolveEffectiveUrl helpers <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/tunnel-registry.ts] -->
- [x] 2.1 Integrate tunnel lifecycle into main process: seedSupervisors, addEnvironment, addEndpoint, removeEndpoint, removeEnvironment, setActiveEndpoint, vmWizard:start, app quit <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/index.ts] -->
- [x] 2.2 Wire resolveEffectiveUrl into api:request and stream:subscribe handlers <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/index.ts] -->
- [x] 3.1 Add optional URL resolver to EndpointHealthTracker for SSH endpoint health probes <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/connection-supervisor.ts] -->
- [x] 4.1 Write unit tests for tunnel-registry.ts <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/__tests__/tunnel-registry.test.ts] -->
- [x] 5.1 Typecheck and verify no new errors <!-- agent: frontend-engineer.fast, depends_on: [2.1, 2.2, 3.1, 4.1], touches: [] -->
