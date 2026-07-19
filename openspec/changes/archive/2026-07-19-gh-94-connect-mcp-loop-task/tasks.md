# Tasks — Connect MCP server to home instance

- [x] Add MCP types and IPC contract in `shared/ipc.ts`
- [x] Implement MCP client module (`mcp-client.ts`) in main process
- [x] Add MCP IPC handlers in `main/index.ts`
- [x] Add preload bridge for MCP IPC channels
- [x] Add `IMcpService` interface in renderer services
- [x] Implement real `McpService` (delegates to `window.api.mcp`)
- [x] Implement `MockMcpService` for browser-only dev
- [x] Wire MCP service into DI container (real + mock)
- [x] Auto-connect MCP on environment creation / endpoint switch
- [x] Auto-disconnect MCP on environment removal
- [x] Add i18n keys for MCP error messages
