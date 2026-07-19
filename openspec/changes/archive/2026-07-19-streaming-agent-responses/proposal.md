# Streaming Agent Responses with Stop Control

## Summary

Implement token-by-token streaming of agent (OpenCode) responses in the chat UI, with a visible Stop button that cancels the in-flight generation while preserving partial output in the transcript.

## Problem

Currently, the session chat view (`App.tsx` view kind `"session"`) shows a static placeholder. The `InfraChatPanel` has a synthetic streaming simulation (character-by-character with `setInterval`), but there is no real connection to the OpenCode runtime. Users cannot see agent replies as they arrive, and they cannot cancel a running generation. This makes the chat feel dead and uncontrollable.

## Solution

### 1. Agent Streaming Service (main process)

Add a new `agent-client.ts` module in the main process that uses the OpenCode SDK v2's `session.promptAsync` + `v2.session.events` SSE stream to:
- Send a user prompt to the OpenCode runtime on a given environment
- Stream back assistant message parts (text deltas) as they arrive via SSE
- Support aborting an in-flight session via `v2.session.interrupt`
- Forward streaming events to the renderer through a new `agent:stream` IPC channel

### 2. IPC Contract Extension

Add to `src/shared/ipc.ts`:
- `AgentStreamEvent` — discriminated union of streaming event types (text-delta, tool-call-start, tool-call-output, turn-finished, turn-error)
- `AgentStreamArgs` — environmentId + prompt + optional sessionId
- New IPC channel: `agent:sendPrompt` (invoke), `agent:streamEvent` (push), `agent:interrupt` (invoke)

### 3. Agent Service in Renderer

Add `IAgentService` interface and implementations:
- Real impl: calls `window.api.agent` (IPC bridge)
- Mock impl: simulates streaming with synthetic delays for `pnpm dev:web`

### 4. Session Chat View Component

Replace the placeholder `session-chat-placeholder` with a real `SessionChatView` component that:
- Uses `useTranscript` for local transcript state
- On send: calls `agentService.sendPrompt()` which returns streaming events
- Appends text deltas to the assistant message via `appendAssistantContent`
- Shows the Stop button (already in `ChatComposer`) when streaming
- On stop: calls `agentService.interrupt()`, which signals the main process to abort
- Preserves partial output in the transcript on interrupt

### 5. Streaming Indicator

While streaming, the assistant message renders with a blinking cursor (already handled via `streaming` prop on `MarkdownContent` and the CSS animation in `theme.css`).

## Scope

- Only the `view.kind === "session"` path in `App.tsx`
- OpenCode runtime only (Claude Code support follows the same adapter pattern but is out of scope for this issue)
- No changes to `InfraChatPanel` (it has its own local streaming simulation)
- No new sidebar navigation or top-level surfaces

## Files Touched

- `src/shared/ipc.ts` — new types + bridge extensions
- `src/main/agent-client.ts` — new file: OpenCode streaming adapter
- `src/main/index.ts` — register new IPC handlers
- `src/preload/index.ts` — wire new agent bridge
- `src/renderer/src/services/interfaces.ts` — IAgentService
- `src/renderer/src/services/impl/AgentService.ts` — new real impl
- `src/renderer/src/services/mock/MockServices.ts` — mock impl
- `src/renderer/src/services/container.ts` — register service
- `src/renderer/src/components/SessionChatView.tsx` — new file: replacement for placeholder
- `src/renderer/src/App.tsx` — wire SessionChatView
- `src/renderer/src/theme.css` — streaming cursor animation
