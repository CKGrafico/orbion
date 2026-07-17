# Tasks — gh-78-choose-reach-method

## Tasks

- [x] **T1: Add ReachMethod type and pick-reach-method step to IPC contract**
  - Agent: fullstack-engineer
  - Files: `src/shared/ipc.ts`
  - Add `ReachMethod = "local" | "ssh"`
  - Add `"pick-reach-method"` to `VmWizardStep`
  - Add `reachMethod` field to `VmWizardProgress`
  - Update `VmWizardBridge.startWizard` signature

- [x] **T2: Implement local wizard path in main process**
  - Agent: fullstack-engineer
  - Files: `src/main/vm-wizard.ts`, `src/main/index.ts`
  - Add `runLocalWizard()` function: validates URL, health-checks daemon, creates environment
  - Update `runWizard()` to dispatch by reach method
  - Update IPC handler to pass reach method and direct URL

- [x] **T3: Update preload bridge for new params**
  - Agent: fullstack-engineer
  - Files: `src/preload/index.ts`
  - Update `startWizard` call to include `reachMethod` and `directUrl` params

- [x] **T4: Build reach-method chooser UI**
  - Agent: frontend-engineer
  - Files: `src/renderer/src/components/AddVmWizard.tsx`
  - Add two-card chooser (Local / SSH) with icons
  - Show conditional fields based on selection
  - Update step order and labels
  - Pass reach method and URL to startWizard

- [x] **T5: Add i18n strings**
  - Agent: frontend-engineer
  - Files: `src/renderer/src/i18n/en.json`
  - Add keys: reachMethodLabel, reachMethodLocal, reachMethodLocalDesc, reachMethodSsh, reachMethodSshDesc, localUrlLabel, localUrlPlaceholder, localUrlInvalid, mainInvalidDirectUrl, mainDirectUrlUnreachable

- [x] **T6: Update renderer services and mock adapter**
  - Agent: fullstack-engineer
  - Files: `src/renderer/src/services/interfaces.ts`, `src/renderer/src/services/impl/VmWizardService.ts`, `src/renderer/src/services/mock/MockServices.ts`
  - Update `IVmWizardService.startWizard` signature
  - Update implementation pass-through
  - Update mock to accept new params
