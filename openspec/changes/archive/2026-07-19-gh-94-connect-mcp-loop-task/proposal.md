# Connect the agent to the home instance's loop-task MCP server

**Issue:** #94
**Status:** Implemented
**Branch:** `feat/gh-94-connect-mcp-loop-task`

## Summary

On session start, the runtime is configured with the home instance's loop-task MCP endpoint (daemon MCP server, default port 8846, over the same tunnel/local path as the HTTP API). Tool calls route to the correct instance; switching sessions switches endpoints. MCP failures surface as a readable chat error, not a silent no-op.

## Design

- **MCP runs in the main process.** Following the existing architecture invariant (all HTTP runs in main), the MCP JSON-RPC calls are proxied through the main process. The renderer communicates via typed IPC, identical to the `api:request` pattern.
- **Tool discovery at runtime.** The `mcp-client.ts` module sends `initialize` + `tools/list` JSON-RPC requests on connect. Tool names are never hard-coded or invented — they come from the daemon's MCP server at runtime.
- **Per-environment sessions.** Each environment has its own MCP session (state + discovered tools + base URL). Switching the active endpoint reconnects MCP to the new daemon's MCP server.
- **URL derivation.** The MCP URL is derived from the active endpoint's effective URL (tunneled for SSH), replacing the port with 8846. This works because the MCP server runs alongside the HTTP API on the same host.
- **Readable error surfacing.** All MCP failures (timeout, unreachable, tool-not-found, tool-call-failed) produce `I18nMessage` objects with human-readable keys resolved in the renderer. No silent no-ops.
- **Mock adapter.** `MockMcpService` provides 8 mock MCP tools for browser-only dev. Environments named "no-mcp" simulate MCP unavailability.

## Acceptance criteria

- [x] On session start, the runtime is configured with the home instance's loop-task MCP endpoint (daemon MCP server, default port 8846, over the same tunnel/local path as the API).
- [x] Tool calls route to the correct instance; switching sessions switches endpoints.
- [x] MCP failures surface as a readable chat error, not a silent no-op.

## Files changed

| File | Change |
|------|--------|
| `src/shared/ipc.ts` | Added `McpToolInfo`, `McpToolCallResult`, `McpConnectionState`, `McpConnectionStatus`, `McpBridge`; added `mcp` field to `LoopTaskBridge` |
| `src/main/mcp-client.ts` | **New** — MCP JSON-RPC client: connect/disconnect, tool discovery, tool calls, URL derivation, session management |
| `src/main/index.ts` | Added `mcp:getStatus`, `mcp:connect`, `mcp:disconnect`, `mcp:callTool` IPC handlers; auto-connect in `seedSupervisors`, `vmWizard:start`, `setActiveEndpoint`; cleanup in `removeEnvironment` |
| `src/preload/index.ts` | Added `mcp` bridge with `getStatus`, `connect`, `disconnect`, `callTool`, `onStatusChange` |
| `src/renderer/src/services/interfaces.ts` | Added `IMcpService` interface; imported MCP types |
| `src/renderer/src/services/impl/McpService.ts` | **New** — Real MCP service (delegates to `window.api.mcp`) |
| `src/renderer/src/services/mock/MockServices.ts` | Added `MockMcpService` with 8 mock tools |
| `src/renderer/src/services/container.ts` | Wired `IMcpService`/`McpService`/`MockMcpService` into DI |
| `src/renderer/src/i18n/en.json` | Added `mcp.*` i18n keys for all error/status messages |
