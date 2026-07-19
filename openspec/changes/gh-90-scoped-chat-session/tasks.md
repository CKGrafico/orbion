# Tasks — gh-90-scoped-chat-session

## 1. Data model & IPC contract

- [ ] 1.1 Add `environmentId` and `workingDirectory` fields to `ChatSession` in `src/shared/ipc.ts` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [ ] 1.2 Extend `updateChatSession` in `ConfigBridge` to accept `environmentId` and `workingDirectory` in the updatable partial `<Pick<ChatSession, "title" | "lastActiveAt" | "environmentId" | "workingDirectory">>` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/shared/ipc.ts] -->
- [ ] 1.3 Update IPC validation in `src/main/ipc-validation.ts` for `config:addChatSession` and `config:updateChatSession` to validate the new fields <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/ipc-validation.ts] -->
- [ ] 1.4 Update `IConfigService` interface in `src/renderer/src/services/interfaces.ts` to match the new `updateChatSession` signature <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/renderer/src/services/interfaces.ts] -->

## 2. Config store (main process)

- [ ] 2.1 Update `addChatSession` and `updateChatSession` functions in `src/main/config-store.ts` to handle `environmentId` and `workingDirectory` <!-- agent: frontend-engineer.build, depends_on: [1.1, 1.2], touches: [src/main/config-store.ts] -->
- [ ] 2.2 Update IPC handler registration in `src/main/index.ts` for `config:updateChatSession` to pass the extended partial type (ensure new fields are forwarded) <!-- agent: frontend-engineer.build, depends_on: [1.2, 2.1], touches: [src/main/index.ts] -->

## 3. Mock adapter

- [ ] 3.1 Add `environmentId` and `workingDirectory` to `MOCK_CHAT_SESSIONS` in `src/renderer/src/services/mock/MockServices.ts` <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/renderer/src/services/mock/MockServices.ts] -->
- [ ] 3.2 Update `MockConfigService.updateChatSession` to handle the new fields <!-- agent: frontend-engineer.fast, depends_on: [1.4, 3.1], touches: [src/renderer/src/services/mock/MockServices.ts] -->

## 4. Renderer config service implementation

- [ ] 4.1 Update `ConfigService` (real impl) in `src/renderer/src/services/impl/ConfigService.ts` to match the new `updateChatSession` signature <!-- agent: frontend-engineer.build, depends_on: [1.4], touches: [src/renderer/src/services/impl/ConfigService.ts] -->

## 5. Session header rendering

- [ ] 5.1 Replace the session header placeholder in `App.tsx` with a proper header showing project color bullet, project name, and working directory in muted monospace, with reactive updates from session data and `perEnvProjects` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/App.tsx, src/renderer/src/theme.css] -->
- [ ] 5.2 Add CSS styles for the session header directory chip (muted monospace) in `theme.css` <!-- agent: frontend-engineer.build, depends_on: [5.1], touches: [src/renderer/src/theme.css] -->

## 6. Session creation on project open

- [ ] 6.1 Add "Open in chat" action button to project nodes in `Sidebar.tsx` (MessageSquare icon), creating/resuming a session for the project on its primary instance, deriving `workingDirectory` from loop data <!-- agent: frontend-engineer.build, depends_on: [1.1, 3.1, 4.1], touches: [src/renderer/src/components/Sidebar.tsx] -->
- [ ] 6.2 Add session creation/resume logic in `App.tsx` — when "open in chat" is requested, find or create a session with `environmentId` and derived `workingDirectory`, then navigate to it <!-- agent: frontend-engineer.build, depends_on: [1.1, 6.1], touches: [src/renderer/src/App.tsx] -->

## 7. i18n

- [ ] 7.1 Add i18n keys for the session header (project name tooltip, directory label, "open in chat" tooltip) in `src/renderer/src/i18n/en.json` <!-- agent: frontend-engineer.fast, depends_on: [5.1, 6.1], touches: [src/renderer/src/i18n/en.json] -->

## 8. Verification

- [ ] 8.1 Run `pnpm typecheck` and fix any type errors introduced by the new fields <!-- agent: frontend-engineer.fast, depends_on: [1.1, 2.1, 3.1, 4.1, 5.1, 6.1], touches: [] -->
