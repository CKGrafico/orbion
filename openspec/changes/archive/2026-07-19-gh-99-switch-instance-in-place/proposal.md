## Why

Switching the instance selector mid-conversation currently updates the session's `environmentId` and appends a plain-text note, but does **not** stop an in-flight agent generation, does **not** mark assistant messages with "on \<instance\>" attribution, and does **not** render an explicit visual divider at the handoff point. This makes multi-instance conversations confusing: you cannot tell which instance produced which response, and switching while the agent is streaming silently re-points the next prompt without stopping the current one—leading to split-brain output.

## What Changes

- **Stop in-flight generation on switch.** `handleInstanceSwitch` will call `agentService.interrupt()` on the *old* environment before re-pointing the session. This ensures no agent output continues from the old instance after the handoff.
- **Add "on \<instance\>" attribution to assistant messages.** A new `environmentId` field on `TranscriptMessage` records which instance produced that message. The renderer shows a compact attribution label (e.g. "on dev-vm") on assistant messages.
- **Render an explicit handoff divider.** The current plain-text "Switched instance to X" note becomes a visual divider row in the transcript—a styled separator clearly marking the switch point, with the old and new instance names.
- **Re-point MCP endpoint and working directory.** After the interrupt, the MCP connection status for the new instance is checked/refreshed so the agent's tool set updates immediately. Working directory already updates on switch; no change needed.

## Capabilities

### New Capabilities
- `instance-handoff`: In-flight interrupt, instance attribution on messages, and handoff divider rendering

### Modified Capabilities

## Impact

- **Shared types** (`src/shared/ipc.ts`): `TranscriptMessage` gains an optional `environmentId` field.
- **Renderer** (`src/renderer/src/App.tsx`): `handleInstanceSwitch` gains interrupt-before-switch logic.
- **Renderer** (`src/renderer/src/components/SessionChatView.tsx`): new `instance-handoff` row rendering.
- **Chat types** (`src/renderer/src/chat/types.ts`): new `InstanceHandoffRow` type.
- **Transcript hook** (`src/renderer/src/chat/useTranscript.ts`): recognise handoff messages and build divider rows.
- **i18n** (`src/renderer/src/i18n/en.json`): new keys for handoff label and attribution.
- **Theme** (`src/renderer/src/theme.css`): styles for handoff divider and attribution label.
- **Mock services** (`src/renderer/src/services/mock/MockServices.ts`): `environmentId` field support on mock transcript messages.
- **Main process persistence** (`src/main/transcript-store.ts`): persist per-message `environmentId`.
