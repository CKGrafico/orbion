# Proposal: Agent SSE Streaming — Fix sendPromptToAgent Truncation

## Problem

`sendPromptToAgent` in `src/main/agent-client.ts` reads the synchronous JSON response from `POST /session/{id}/message`, extracts text, emits a single `text-delta` and immediately emits `turn-finished`. The OpenCode API streams responses via SSE on `/v2/session/{id}/events`. Multi-chunk responses, tool calls, and long agent turns are silently truncated after the first chunk.

## Solution

After the prompt POST succeeds, open a GET to `/v2/session/{id}/events` with SSE headers. Use the existing `parseSseStream` utility to parse the SSE stream. Map SSE data events to `AgentStreamEvent` kinds (`text-delta`, `tool-call-start`, `tool-call-output`, `turn-finished`, `turn-error`). Forward each event to the renderer via `forwardEvent`. Only emit `turn-finished` when the SSE stream delivers it. Handle abort, timeout, and cleanup.

## Scope

- Modified: `src/main/agent-client.ts` — rewrite the post-prompt section to consume SSE
- New test: `tests/agent-client-sse.test.ts` — unit tests for SSE stream consumption

## Acceptance Criteria

1. `sendPromptToAgent` opens the SSE stream after prompt POST and forwards events incrementally
2. `turn-finished` is only emitted when the SSE stream sends it
3. `tool-call-start` and `tool-call-output` events are forwarded from SSE
4. Abort during streaming cleans up the in-flight entry and emits `turn-interrupted`
5. `pnpm typecheck` passes
6. `pnpm test` passes
7. `pnpm build` passes

## References

- Issue #395
