# Tasks

- [ ] 1.1 Add `handleConfigError` utility function to store.ts that logs to console.error with operation name and error details <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/store.ts] -->
- [ ] 1.2 Replace all 8 `.catch(() => {})` calls in store.ts with `.catch((err) => handleConfigError(...))` — operations: setSelectedEnvironmentId, removeEnvironment, addEndpoint, removeEndpoint, setActiveEndpoint, removeSessionToken, setOpenCodeEndpoint, setMainVm <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/store.ts] -->
- [ ] 1.3 For setOpenCodeEndpoint: add `.then()` branch that logs `result.reason` when `result.ok === false` (currently only `result.ok === true` is handled) <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/store.ts] -->
- [ ] 2.1 Add i18n keys for config error messages in en.json (store.configError.* namespace) for future toast integration <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/renderer/src/i18n/en.json] -->
- [ ] 3.1 Verify TypeScript compilation passes with no errors <!-- agent: frontend-engineer.fast, depends_on: [1.2, 1.3, 2.1], touches: [] -->
