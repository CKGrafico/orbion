# Tasks

## 1. IPC types and bridge contract (src/shared/ipc.ts)

**Tier**: core  
**Agent**: default  
**Depends on**: —  
**Touches**: src/shared/ipc.ts

Add to `src/shared/ipc.ts`:
- `RestoreAvailability` type: `{ available: true; environmentCount: number; environmentNames: string[] } | { available: false; reason: string | I18nMessage }`
- `PullRestoreResult` type: `{ ok: true; restored: Environment[] } | { ok: false; error: string | I18nMessage }`
- Add `checkRestoreAvailable()` and `pullRestore()` to `ConfigBridge`

## 2. Main-process restore logic (src/main/config-store.ts)

**Tier**: core  
**Agent**: default  
**Depends on**: 1  
**Touches**: src/main/config-store.ts

Add functions:
- `checkRestoreAvailable()`: Check if the main-VM has `~/.orbion/config.json`. Parse it, count environments, return `RestoreAvailability`.
- `pullRestore()`: Read the VM's config file, parse environments, replace local environments wholesale, return `PullRestoreResult`. Uses the existing `sanitizeEnvironmentForSync` allowlist logic to validate the incoming data.

## 3. IPC handlers in main process (src/main/index.ts)

**Tier**: core  
**Agent**: default  
**Depends on**: 2  
**Touches**: src/main/index.ts

Register:
- `config:checkRestoreAvailable` handler
- `config:pullRestore` handler

After pullRestore, seed supervisors and tunnels for new environments.

## 4. Preload bridge wiring (src/preload/index.ts)

**Tier**: core  
**Agent**: default  
**Depends on**: 1  
**Touches**: src/preload/index.ts

Wire `checkRestoreAvailable()` and `pullRestore()` to ipcRenderer.invoke.

## 5. Renderer service interface and implementations

**Tier**: renderer  
**Agent**: default  
**Depends on**: 4  
**Touches**: 
- src/renderer/src/services/interfaces.ts
- src/renderer/src/services/impl/ConfigService.ts
- src/renderer/src/services/mock/MockServices.ts

Add `checkRestoreAvailable()` and `pullRestore()` to `IConfigService`, `ConfigService`, and `MockConfigService`.

## 6. Renderer restore-offer UI

**Tier**: renderer  
**Agent**: frontend-engineer  
**Depends on**: 5  
**Touches**:
- src/renderer/src/components/ColdOpen.tsx
- src/renderer/src/App.tsx
- src/renderer/src/i18n/ (i18n keys)

Add restore-offer dialog after seed import completes successfully. Show available environments, accept/cancel. After accepting, show per-environment credential prompts. Wire into App.tsx for post-wizard restore flow.

## 7. Verification

**Tier**: verification  
**Agent**: default  
**Depends on**: all  
**Touches**: — 

Run `pnpm typecheck`. Verify the mock adapter still works (no new `window.api` calls without a mock counterpart).
