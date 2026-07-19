# Spec: model and reasoning selectors

## Model catalog

### IPC types (src/shared/ipc.ts)

```ts
/** A model offered by a runtime adapter, with availability metadata. */
export interface ModelInfo {
  /** Unique model identifier (e.g. "openai/gpt-4o", "anthropic/claude-3.5-sonnet"). */
  id: string;
  /** Human-readable display name. */
  label: string;
  /** The provider or runtime family (e.g. "openai", "anthropic"). */
  provider: string;
  /** Whether this model can currently be used. */
  available: boolean;
  /** Human-readable reason if unavailable. */
  unavailableReason?: string;
  /** Reasoning effort levels this model supports (empty if unsupported). */
  reasoningEfforts?: ReasoningEffort[];
}

/** A reasoning effort level. */
export type ReasoningEffort = "low" | "medium" | "high";

/** Result of listing models from a runtime adapter. */
export interface ListModelsResult {
  ok: boolean;
  models?: ModelInfo[];
  error?: string | I18nMessage;
}
```

### AgentBridge extension

Add `listModels(environmentId: string): Promise<ListModelsResult>` to `AgentBridge`.

### ChatSession extension

Add to `ChatSession`:
- `activeModel?: string` — the model ID (provider/name format)
- `reasoningEffort?: ReasoningEffort` — the selected effort level

### ConfigBridge extension

Add `activeModel` and `reasoningEffort` to the `updateChatSession` partial type.

## UI components

### ModelSelector (new component)

A dropdown (custom `<select>`-like) in the session header that:
1. Fetches models via `IAgentService.listModels(environmentId)`
2. Groups models by provider
3. Disables unavailable models with tooltip showing reason
4. Persists selection to `ChatSession.activeModel`
5. Falls back to a static catalog if the dynamic call fails

### ReasoningEffortSelector (new component)

A small dropdown that:
1. Takes the selected model's `reasoningEfforts` array
2. Shows `low` / `medium` / `high` options
3. Hides when the model has no `reasoningEfforts` or array is empty
4. Persists selection to `ChatSession.reasoningEffort`

### Session header integration

The session header in `App.tsx` already renders `AgentRuntimeSwitcher`. The new selectors are placed after it:
- `AgentRuntimeSwitcher` (existing) — runtime family (opencode/claude)
- `ModelSelector` (new) — specific model within the active runtime
- `ReasoningEffortSelector` (new, conditional) — reasoning effort when supported
