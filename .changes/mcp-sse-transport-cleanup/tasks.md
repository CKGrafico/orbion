# Tasks — mcp-sse-transport-cleanup

## Task 1: Set transport.closed in SSE reader error handler
- **File:** `src/main/mcp-client.ts`
- **Action:** Add `transport.closed = true;` before the pending-rejection loop in the catch block (line ~241).
- **Agent:** inline
- **Depends on:** none

## Task 2: Guard sseRpcRequest against closed transport
- **File:** `src/main/mcp-client.ts`
- **Action:** Add `if (transport.closed) { throw new Error("SSE transport is closed"); }` at the top of `sseRpcRequest`, before the `postEndpoint` check (line ~124).
- **Agent:** inline
- **Depends on:** none

## Task 3: Verify typecheck, tests, build pass
- **Action:** Run `rtk pnpm typecheck`, `rtk proxy pnpm test`, `rtk proxy pnpm build`.
- **Agent:** inline
- **Depends on:** Task 1, Task 2
