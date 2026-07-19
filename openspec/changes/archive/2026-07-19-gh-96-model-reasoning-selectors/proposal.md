# Chat header: model and reasoning selectors with availability

## Change ID
gh-96-model-reasoning-selectors

## Summary
Add a model dropdown and a reasoning-effort selector to the chat session header. The model dropdown lists models reported by the active runtime adapter with unavailable options disabled and a short reason. The reasoning-effort selector shows supported levels for the active model/runtime pair and hides when unsupported. Both selections persist per session and apply to the next message.

## Motivation
Currently the chat header has an `AgentRuntimeSwitcher` (OpenCode vs Claude), but no way to choose which **model** (e.g. GPT-4o, Claude 3.5 Sonnet) the agent uses, or what **reasoning effort** level applies. Users discover configuration errors only mid-chat. This change surfaces model and reasoning control at selection time in the header, preventing late failures.

## Acceptance Criteria
1. Model dropdown lists models the active runtime adapter reports for this instance; selection persists per session and applies next message.
2. Models reported unavailable (not configured, missing auth) render disabled with a short reason; selecting an available model never later errors for that same state.
3. A reasoning-effort selector shows the levels the active runtime/model supports and is hidden when unsupported; it persists per session.

## Design Decisions
- **Model info comes from the OpenCode runtime.** The `OpenCodeConnectionStatus.connectedProviders` already lists provider names. We extend this with a new IPC bridge method `agent:listModels` that returns the model catalog with availability metadata. For the Claude runtime, a parallel method (or the same endpoint) returns Claude models.
- **Reasoning effort is a small dropdown.** Not all models support reasoning effort. The model catalog entry advertises supported effort levels. When none are available (or only one default), the selector is hidden.
- **Per-session persistence via ChatSession.** We add `activeModel` and `reasoningEffort` fields to `ChatSession` in `ipc.ts` and persist them through `ConfigService.updateChatSession`.
- **No new IPC channel.** We add `agent.listModels` to the existing `AgentBridge`, which proxies through the main process to the OpenCode/Claude server.
- **Mock adapter returns realistic model data** so `pnpm dev:web` works end-to-end.

## Risks
- Model availability is a point-in-time snapshot; a model available at selection could become unavailable later. We mitigate by checking availability on session focus and disabling stale selections.
- The OpenCode runtime may not expose a model list API yet. We fall back to a static catalog keyed by provider when the dynamic call fails.
