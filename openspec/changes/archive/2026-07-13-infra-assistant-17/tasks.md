# Tasks: infra-assistant-17

## T1. Add EnvironmentRole to shared IPC types
- File: `src/shared/ipc.ts`
- Add `EnvironmentRole = "coding" | "main-vm"`, add `role` and `infraOpenCode` to `Environment`.
- Add `setMainVm` and `getMainVmId` to `ConfigBridge`.
- Add `InfraBridge` with `executeAction` and `getStatus`.
- Agent: basic-engineer

## T2. Persist role and infraOpenCode in config-store
- File: `src/main/config-store.ts`
- Add `role` and `infraOpenCode` to `EnvironmentWithFingerprint`.
- Implement `setMainVm()`, `getMainVmId()`, `getMainVm()`.
- Default `role: "coding"` on existing environments.
- Agent: basic-engineer

## T3. Wire IPC handlers in main process
- File: `src/main/index.ts`
- Add handlers for `config:setMainVm`, `config:getMainVmId`, `infra:executeAction`.
- Auto-promote first environment to main-vm when no main-vm exists.
- On main-vm removal, clear infra state.
- Agent: basic-engineer

## T4. Update preload bridge
- File: `src/preload/index.ts`
- Wire `config.setMainVm`, `config.getMainVmId`, `infra.executeAction`, `infra.getStatus`.
- Agent: basic-engineer

## T5. Update renderer types and store
- Files: `src/renderer/src/types.ts`, `src/renderer/src/store.ts`
- Re-export `EnvironmentRole`.
- Add `mainVm` derived state, `setMainVm` action to `useEnvironments`.
- Agent: basic-engineer

## T6. Build InfraChatPanel component
- File: `src/renderer/src/components/InfraChatPanel.tsx`
- New component with amber-accent border, "Infrastructure" label, fleet prompt placeholder.
- Reuses TranscriptView + ChatComposer architecture with isolated state.
- Includes infra action handlers (machine-status, clone-repo).
- Agent: basic-engineer

## T7. Build PickMainVmModal component
- File: `src/renderer/src/components/PickMainVmModal.tsx`
- Modal shown when main-vm is removed and other environments exist.
- Lists candidate environments, "Set as main VM" and "Skip" actions.
- Agent: basic-engineer

## T8. Wire infra panel into App and Sidebar
- Files: `src/renderer/src/App.tsx`, `src/renderer/src/components/Sidebar.tsx`
- Render InfraChatPanel in sidebar when main-vm exists.
- Show/hide infra section based on main-vm state.
- Wire PickMainVmModal on main-vm removal.
- Agent: basic-engineer

## T9. Add infra chat styles to theme.css
- File: `src/renderer/src/theme.css`
- Add `--accent-infra: #e8a24e` token.
- `.infra-chat-panel`, `.infra-chat-title`, `.infra-composer` styles.
- Distinct visual identity with amber accent.
- Agent: basic-engineer

## T10. Verify and fix typecheck
- Run `rtk pnpm typecheck`, fix any issues.
- Agent: basic-engineer
