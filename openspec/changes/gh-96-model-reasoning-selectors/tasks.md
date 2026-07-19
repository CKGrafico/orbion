# Tasks: gh-96-model-reasoning-selectors

## 1. Types and IPC contract

- [ ] 1.1 Add `ModelInfo`, `ReasoningEffort`, `ListModelsResult` types to `src/shared/ipc.ts` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [ ] 1.2 Add `listModels(environmentId)` to `AgentBridge` in `src/shared/ipc.ts` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/shared/ipc.ts] -->
- [ ] 1.3 Add `activeModel` and `reasoningEffort` fields to `ChatSession` in `src/shared/ipc.ts` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/shared/ipc.ts] -->
- [ ] 1.4 Extend `ConfigBridge.updateChatSession` partial to include `activeModel` and `reasoningEffort` <!-- agent: frontend-engineer.build, depends_on: [1.3], touches: [src/shared/ipc.ts] -->

## 2. Service layer

- [ ] 2.1 Add `listModels(environmentId)` to `IAgentService` interface <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/renderer/src/services/interfaces.ts] -->
- [ ] 2.2 Implement `listModels` in `AgentService` (delegates to `window.api.agent.listModels`) <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/services/impl/AgentService.ts] -->
- [ ] 2.3 Implement `listModels` in `MockAgentService` with realistic model catalog <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/services/mock/MockServices.ts] -->
- [ ] 2.4 Add `listModels` handler to preload bridge and main process IPC <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/preload/index.ts, src/main/index.ts] -->
- [ ] 2.5 Implement main-process `handleListModels` that queries the OpenCode/Claude server or falls back to a static catalog <!-- agent: frontend-engineer.build, depends_on: [2.4], touches: [src/main/agent-models.ts] -->

## 3. UI components

- [ ] 3.1 Create `ModelSelector` component with dropdown, availability, and grouping <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/components/ModelSelector.tsx] -->
- [ ] 3.2 Create `ReasoningEffortSelector` component with conditional visibility <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/components/ReasoningEffortSelector.tsx] -->
- [ ] 3.3 Add i18n keys for model selector, reasoning effort selector, and availability reasons <!-- agent: frontend-engineer.fast, depends_on: [3.1], touches: [src/renderer/src/i18n/en.json] -->

## 4. Integration

- [ ] 4.1 Wire `ModelSelector` and `ReasoningEffortSelector` into session header in `App.tsx`, with model persistence via `configService.updateChatSession` <!-- agent: frontend-engineer.build, depends_on: [3.1, 3.2, 1.3], touches: [src/renderer/src/App.tsx] -->
- [ ] 4.2 Pass `activeModel` and `reasoningEffort` through to `SessionChatView` and `agentService.sendPrompt` <!-- agent: frontend-engineer.build, depends_on: [4.1], touches: [src/renderer/src/App.tsx, src/renderer/src/components/SessionChatView.tsx] -->
- [ ] 4.3 Add `reasoningEffort` field to `AgentSendPromptArgs` and pass through the agent pipeline <!-- agent: frontend-engineer.build, depends_on: [4.2], touches: [src/shared/ipc.ts, src/renderer/src/services/impl/AgentService.ts, src/main/index.ts] -->
- [ ] 4.4 Style the model and reasoning selectors to match the segmented pill pattern and dark theme <!-- agent: frontend-engineer.fast, depends_on: [3.1, 3.2], touches: [src/renderer/src/theme.css] -->

## 5. Verification

- [ ] 5.1 Run `pnpm typecheck` and fix any type errors <!-- agent: frontend-engineer.fast, depends_on: [4.3, 4.4], touches: [] -->
- [ ] 5.2 Verify mock mode works end-to-end with `pnpm dev:web` <!-- agent: frontend-engineer.fast, depends_on: [5.1], touches: [] -->
