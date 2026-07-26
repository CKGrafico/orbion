# fix: MCP SSE stream data loss on partial lines

## Summary

When the SSE stream in `src/main/mcp-client.ts` closes mid-line, any remaining data in `dataBuffer` is discarded. This causes silent loss of JSON-RPC responses, leading to intermittent MCP operation failures.

## Motivation

- MCP tool call responses can be silently lost
- Pending requests in `transport.pending` time out instead of receiving responses
- User-visible: MCP operations fail intermittently, hard to diagnose

## Approach

1. Hoist `dataBuffer` declaration outside the `while` loop (currently declared inside, reset each iteration)
2. After the `while` loop exits normally (stream done), flush any remaining `dataBuffer` content via `processData`

## Scope

- Single file: `src/main/mcp-client.ts`
- Lines 216-236 (the SSE reader async IIFE)

## Acceptance Criteria

- `dataBuffer` persists across loop iterations
- Remaining `dataBuffer` content processed after stream ends
- `pnpm typecheck` passes
- `pnpm build` passes
- `pnpm test` passes (if test suite exists)
