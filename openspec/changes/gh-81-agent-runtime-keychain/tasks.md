## 1. Contracts and Credential Persistence

- [x] 1.1 Add agent runtime, credential reference, and typed wizard-start contracts to the shared IPC model <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [x] 1.2 Implement a dedicated safeStorage-backed credential vault, environment reference attachment, legacy session-token migration, and removal cleanup <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/credential-vault.ts, src/main/config-store.ts] -->

## 2. Wizard and IPC Integration

- [x] 2.1 Pass the typed runtime and optional SSH passphrase through preload and renderer service boundaries, including mock mode <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/preload/index.ts, src/renderer/src/services/interfaces.ts, src/renderer/src/services/impl/VmWizardService.ts, src/renderer/src/services/mock/MockServices.ts] -->
- [x] 2.2 Persist runtime and credentials in local and SSH wizard paths, make the selected remote runtime mandatory, and wire validated main-process IPC <!-- agent: frontend-engineer.build, depends_on: [1.2, 2.1], touches: [src/main/vm-wizard.ts, src/main/index.ts, src/main/ipc-validation.ts] -->

## 3. Wizard User Experience

- [x] 3.1 Add the runtime selector and optional SSH key passphrase field to the add-environment wizard with localized copy and existing visual tokens <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/components/AddVmWizard.tsx, src/renderer/src/i18n/en.json] -->

## 4. Verification

- [x] 4.1 Add focused tests for runtime defaults, credential references, encrypted vault behavior, and environment cleanup <!-- agent: frontend-engineer.build, depends_on: [1.2, 2.2, 3.1], touches: [tests/credential-vault.test.ts, tests/vm-wizard-runtime.test.ts] -->
- [x] 4.2 Run the full test suite, typecheck, and production build, then fix regressions <!-- agent: frontend-engineer.fast, depends_on: [4.1], touches: [] -->
