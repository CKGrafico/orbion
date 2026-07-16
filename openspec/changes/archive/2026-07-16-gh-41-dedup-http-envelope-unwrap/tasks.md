# Tasks

- [ ] 1.1 Create `src/main/http-utils.ts` with `fetchAndUnwrap()` utility <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/http-utils.ts] -->
- [ ] 1.2 Create `src/shared/utils.ts` with `compareSemver()` and `trimTrailingSlash()` <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/shared/utils.ts] -->
- [ ] 2.1 Refactor `handleApiRequest` in `src/main/index.ts` to use `fetchAndUnwrap` and `trimTrailingSlash` <!-- agent: frontend-engineer.build, depends_on: [1.1, 1.2], touches: [src/main/index.ts] -->
- [ ] 2.2 Refactor `makeProbe` and `fetchFingerprint` in `src/main/connection-supervisor.ts` to use `fetchAndUnwrap` and `trimTrailingSlash` <!-- agent: frontend-engineer.build, depends_on: [1.1, 1.2], touches: [src/main/connection-supervisor.ts] -->
- [ ] 2.3 Refactor `exchangePairingCode` in `src/main/config-store.ts` to use `fetchAndUnwrap` and `trimTrailingSlash` <!-- agent: frontend-engineer.build, depends_on: [1.1, 1.2], touches: [src/main/config-store.ts] -->
- [ ] 2.4 Replace local `compareSemver` in `ssh-probe.ts` with import from `shared/utils` <!-- agent: frontend-engineer.fast, depends_on: [1.2], touches: [src/main/ssh-probe.ts] -->
- [ ] 2.5 Replace local `compareSemver` and inline `trimTrailingSlash` in `opencode-client.ts` with imports from `shared/utils` <!-- agent: frontend-engineer.fast, depends_on: [1.2], touches: [src/main/opencode-client.ts] -->
- [ ] 2.6 Replace inline `trimTrailingSlash` in `src/renderer/src/store.ts` with import from `shared/utils` <!-- agent: frontend-engineer.fast, depends_on: [1.2], touches: [src/renderer/src/store.ts] -->
- [ ] 3.1 Verify TypeScript compilation passes across all changed files <!-- agent: frontend-engineer.fast, depends_on: [2.1, 2.2, 2.3, 2.4, 2.5, 2.6], touches: [] -->
