# gh-359-dedup-sse-parser Tasks

## Task 1: Add createSseParser factory to sse-parser.ts
- **Agent:** frontend-engineer
- **Tier:** build
- **Depends on:** none
- **Touches:** src/main/sse-parser.ts
- **Description:** Export a `createSseParser(onEvent: (event: SseEvent) => void)` function that returns `{ feed(chunk: string): void }`. Internally it creates an `eventsource-parser` and feeds chunks to it. This is the same logic as `parseSseStream` but without stream ownership.

## Task 2: Refactor mcp-client.ts to use createSseParser
- **Agent:** frontend-engineer
- **Tier:** build
- **Depends on:** Task 1
- **Touches:** src/main/mcp-client.ts
- **Description:** Replace the hand-rolled SSE line parsing in `connectSseTransport()` with `createSseParser`. Remove `processLine`, `currentEvent` buffer, and `dataBuffer` accumulation. Feed decoded chunks directly to the parser. Handle the `endpoint` event and JSON-RPC data events through the `onEvent` callback.

## Task 3: Verify
- **Agent:** frontend-engineer
- **Tier:** fast
- **Depends on:** Task 2
- **Touches:** none
- **Description:** Run `rtk pnpm typecheck`, `rtk pnpm test`, `rtk pnpm build`. Ensure all pass.
