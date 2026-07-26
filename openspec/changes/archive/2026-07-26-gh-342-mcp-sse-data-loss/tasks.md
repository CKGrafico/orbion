# Tasks

## Task 1: Fix SSE dataBuffer lifetime and flush

- **File**: `src/main/mcp-client.ts`
- **Agent**: fullstack-engineer
- **Tier**: build
- **Depends on**: none

### What

1. Move `let dataBuffer = ""` from inside the while loop (line 226) to before the while loop (after line 217)
2. After the while loop exits (before catch block, line 237), add flush: `if (dataBuffer) { processData(dataBuffer); }`

### Verify

- `rtk proxy pnpm typecheck`
- `rtk proxy pnpm test`
- `rtk proxy pnpm build`
