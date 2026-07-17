# Tasks — Edit an issue / work item via chat

## 1. IPC contract and types

- [x] 1.1 Add `edit-issue` to `InfraAction` union, add `EditIssueParams` and `EditIssueResult` interfaces to `src/shared/ipc.ts` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->

## 2. Main-process handler

- [x] 2.1 Implement `edit-issue` case in `infra:executeAction` handler (`src/main/index.ts`) using `gh issue edit` for GitHub and `az boards work-item update` for ADO <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/index.ts] -->
- [x] 2.2 Add i18n message keys for edit-issue errors (no changes provided, issue not found, CLI not available, edit failed) in `src/renderer/src/i18n/en.json` and corresponding `msg()` calls in `src/main/index.ts` <!-- agent: frontend-engineer.fast, depends_on: [2.1], touches: [src/renderer/src/i18n/en.json, src/main/index.ts] -->

## 3. Chat-panel intent detection and UX

- [x] 3.1 Add edit-issue intent detection in `InfraChatPanel.tsx` for keywords: "edit issue", "update issue", "rename issue", "change issue", "add label to issue", "remove label from issue". Parse issue number and requested changes (title, body, label add/remove) from the user message <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/components/InfraChatPanel.tsx] -->
- [x] 3.2 Add confirmation-before-mutation UX: show a preview card of proposed changes with "Apply changes" / "Cancel" question, following the existing create-issue confirmation pattern <!-- agent: frontend-engineer.build, depends_on: [3.1], touches: [src/renderer/src/components/InfraChatPanel.tsx] -->
- [x] 3.3 Add ambiguous reference handling: when the user does not specify a numeric issue reference, respond asking for clarification instead of executing the edit <!-- agent: frontend-engineer.build, depends_on: [3.1], touches: [src/renderer/src/components/InfraChatPanel.tsx] -->

## 4. Mock service counterpart

- [x] 4.1 Add `edit-issue` mock handler in `MockInfraService` (`src/renderer/src/services/mock/MockServices.ts`) that returns a successful `EditIssueResult` <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/renderer/src/services/mock/MockServices.ts] -->

## 5. Verification

- [x] 5.1 Run `pnpm typecheck` and fix any type errors introduced by this change <!-- agent: frontend-engineer.fast, depends_on: [2.1, 3.1, 4.1], touches: [] -->
