# Tasks: Provision the chosen agent runtime from the wizard

## 1. Main-process types and adapter

- [x] 1.1 Add `RuntimeState` type and `runtimeState` field to `Environment` in `src/shared/ipc.ts` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [x] 1.2 Add `"runtime-provision"` and `"runtime-consent"` to `VmWizardStep` union in `src/shared/ipc.ts` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/shared/ipc.ts] -->
- [x] 1.3 Create `src/main/runtime-adapter.ts` with `RuntimeAdapter` interface and `createRuntimeAdapter()` factory, plus OpenCode and Claude Code adapter implementations <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/runtime-adapter.ts] -->
- [x] 1.4 Add `setEnvironmentRuntimeState()` to `src/main/config-store.ts` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/config-store.ts] -->

## 2. Wizard orchestration (main process)

- [x] 2.1 Add runtime provisioning flow to `runWizard()` in `src/main/vm-wizard.ts` (SSH path): after service selection, call `runtimeAdapter.detect()`, then either offer install or proceed <!-- agent: frontend-engineer.build, depends_on: [1.3, 1.4], touches: [src/main/vm-wizard.ts] -->
- [x] 2.2 Add runtime provisioning flow to `runLocalWizard()` in `src/main/vm-wizard.ts` (local/direct path): check opencode endpoint availability, set runtimeState <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/main/vm-wizard.ts] -->
- [x] 2.3 Add `runtimeConsentResolver` to `vm-wizard.ts` for the user's install/skip decision on the runtime-consent step <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/main/vm-wizard.ts] -->
- [x] 2.4 Register `vmWizard:respondRuntimeConsent` IPC handler in `src/main/index.ts` and validate it in `src/main/ipc-validation.ts` <!-- agent: frontend-engineer.build, depends_on: [2.3], touches: [src/main/index.ts, src/main/ipc-validation.ts] -->

## 3. IPC bridge and preload

- [x] 3.1 Add `respondRuntimeConsent` to `VmWizardBridge` in `src/shared/ipc.ts` <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/shared/ipc.ts, src/preload/index.ts] -->

## 4. Renderer service layer

- [x] 4.1 Add `respondRuntimeConsent` to `IVmWizardService` interface in `src/renderer/src/services/interfaces.ts` <!-- agent: frontend-engineer.build, depends_on: [3.1], touches: [src/renderer/src/services/interfaces.ts] -->
- [x] 4.2 Implement `respondRuntimeConsent` in `VmWizardService` (real) in `src/renderer/src/services/impl/VmWizardService.ts` <!-- agent: frontend-engineer.build, depends_on: [4.1], touches: [src/renderer/src/services/impl/VmWizardService.ts] -->
- [x] 4.3 Implement `respondRuntimeConsent` in `MockVmWizardService` in `src/renderer/src/services/mock/MockServices.ts` <!-- agent: frontend-engineer.build, depends_on: [4.1], touches: [src/renderer/src/services/mock/MockServices.ts] -->

## 5. Renderer UI

- [x] 5.1 Update `AddVmWizard.tsx`: add `"runtime-provision"` and `"runtime-consent"` to `STEP_ORDER` and `STEP_LABEL_KEYS` <!-- agent: frontend-engineer.build, depends_on: [1.2, 4.1], touches: [src/renderer/src/components/AddVmWizard.tsx] -->
- [x] 5.2 Update `AddVmWizard.tsx`: add UI for `runtime-provision` step (spinner + detection message) <!-- agent: frontend-engineer.build, depends_on: [5.1], touches: [src/renderer/src/components/AddVmWizard.tsx] -->
- [x] 5.3 Update `AddVmWizard.tsx`: add UI for `runtime-consent` step (install/skip buttons) <!-- agent: frontend-engineer.build, depends_on: [5.1], touches: [src/renderer/src/components/AddVmWizard.tsx] -->

## 6. i18n

- [x] 6.1 Add i18n keys for runtime provisioning steps and messages to `src/renderer/src/i18n/en.json` <!-- agent: frontend-engineer.fast, depends_on: [5.1], touches: [src/renderer/src/i18n/en.json] -->

## 7. Verification

- [x] 7.1 Run `pnpm typecheck` and fix any type errors <!-- agent: frontend-engineer.fast, depends_on: [6.1], touches: [] -->
