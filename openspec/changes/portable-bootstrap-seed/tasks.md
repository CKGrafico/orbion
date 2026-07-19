## 1. Shared types and pure seed logic

- [x] 1.1 Add `BootstrapSeed` type, export/import functions, and `ConfigBridge` methods to `src/shared/ipc.ts` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [x] 1.2 Add pure seed encode/decode functions to `src/shared/utils.ts` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/shared/utils.ts] -->
- [x] 1.3 Add Vitest tests for seed encode/decode in `tests/bootstrap-seed.test.ts` <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [tests/bootstrap-seed.test.ts] -->

## 2. Main-process backend

- [x] 2.1 Add `exportBootstrapSeed` and `importBootstrapSeed` functions to `src/main/config-store.ts` <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/main/config-store.ts] -->
- [x] 2.2 Add IPC validators for `config:exportBootstrapSeed` and `config:importBootstrapSeed` to `src/main/ipc-validation.ts` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/ipc-validation.ts] -->
- [x] 2.3 Register IPC handlers in `src/main/index.ts` for the two new channels <!-- agent: frontend-engineer.build, depends_on: [2.1, 2.2], touches: [src/main/index.ts] -->

## 3. Preload bridge

- [x] 3.1 Add `exportBootstrapSeed` and `importBootstrapSeed` entries to the config bridge in `src/preload/index.ts` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/preload/index.ts] -->

## 4. Renderer services

- [x] 4.1 Add `exportBootstrapSeed` and `importBootstrapSeed` to `IConfigService` interface and `ConfigService` impl <!-- agent: frontend-engineer.build, depends_on: [1.1, 3.1], touches: [src/renderer/src/services/interfaces.ts, src/renderer/src/services/impl/ConfigService.ts] -->
- [x] 4.2 Add mock implementations to `MockConfigService` <!-- agent: frontend-engineer.build, depends_on: [4.1], touches: [src/renderer/src/services/mock/MockServices.ts] -->

## 5. Renderer UI

- [x] 5.1 Add i18n keys for bootstrap seed UI to `src/renderer/src/i18n/en.json` <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/renderer/src/i18n/en.json] -->
- [x] 5.2 Update `ColdOpen.tsx` with "Import seed" button and seed-input dialog <!-- agent: frontend-engineer.build, depends_on: [5.1, 4.1], touches: [src/renderer/src/components/ColdOpen.tsx] -->
- [x] 5.3 Update `App.tsx` to pass seed import handler and wire the wizard with pre-filled values <!-- agent: frontend-engineer.build, depends_on: [5.2], touches: [src/renderer/src/App.tsx] -->
- [x] 5.4 Add "Export seed" action to `InstanceDetail.tsx` for the main-VM <!-- agent: frontend-engineer.build, depends_on: [5.1, 4.1], touches: [src/renderer/src/components/InstanceDetail.tsx] -->

## 6. Verification

- [x] 6.1 Run `pnpm typecheck` and fix any type errors <!-- agent: frontend-engineer.fast, depends_on: [2.3, 3.1, 4.1, 4.2, 5.2, 5.3, 5.4], touches: [] -->
