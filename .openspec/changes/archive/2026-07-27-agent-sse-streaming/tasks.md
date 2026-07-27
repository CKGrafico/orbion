# Tasks: Agent SSE Streaming

## Task 1: Rewrite sendPromptToAgent to consume SSE stream
- **tier**: build
- **touches**: src/main/agent-client.ts
- **done when**: After prompt POST, opens GET /v2/session/{id}/events, parses SSE, forwards AgentStreamEvent events, emits turn-finished only from SSE

## Task 2: Add unit tests for SSE stream consumption
- **tier**: build
- **touches**: tests/agent-client-sse.test.ts
- **done when**: Tests cover text-delta, tool-call-start, tool-call-output, turn-finished from SSE, abort handling, error forwarding
