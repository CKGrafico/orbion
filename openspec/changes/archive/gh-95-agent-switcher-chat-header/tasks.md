# Tasks

- [x] 1.1 Add `activeRuntime: AgentRuntime` to `ChatSession` in `src/shared/ipc.ts`
- [x] 1.2 Widen `ConfigBridge.updateChatSession` type to include `activeRuntime`
- [x] 1.3 Update `updateChatSession` in `src/main/config-store.ts`
- [x] 1.4 Update IPC handler type in `src/main/index.ts`
- [x] 1.5 Add `activeRuntime` validation in `src/main/ipc-validation.ts`
- [x] 1.6 Update renderer `IConfigService` interface signature
- [x] 1.7 Update `ConfigService` implementation signature
- [x] 1.8 Update `MockConfigService.updateChatSession` signature
- [x] 2.1 Create `AgentRuntimeSwitcher` component in `src/renderer/src/components/`
- [x] 2.2 Add i18n keys in `src/renderer/src/i18n/en.json`
- [x] 3.1 Integrate switcher in session header in `App.tsx`
- [x] 3.2 Add `handleRuntimeSwitch` callback with transcript note
- [x] 3.3 Pass `activeRuntime` when creating sessions in `onOpenProjectChat`
- [x] 3.4 Add `activeRuntime` to mock session data
- [x] 4.1 Verify typecheck passes (no new errors)
