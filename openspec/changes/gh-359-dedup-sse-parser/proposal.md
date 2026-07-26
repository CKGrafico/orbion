# Deduplicate SSE parser — mcp-client.ts reimplements sse-parser.ts inline

## Summary
`mcp-client.ts` (`connectSseTransport`) hand-rolls SSE line parsing (checking `startsWith("event:")`, `startsWith("data:")`, buffering multi-line data) instead of using the spec-compliant `eventsource-parser` already available via `sse-parser.ts`. The hand-rolled parser does not handle `id:`, `retry:`, or comment lines conformantly.

## Motivation
- Drift risk: two independent SSE parsers can diverge when format changes.
- Spec coverage: inline parser only handles `event:` + `data:`; the `eventsource-parser` handles the full spec.
- Issue #359: `agent-client.ts` inline parser was already removed, but `mcp-client.ts` still has one.

## Approach
1. Extend `sse-parser.ts` with a `createSseParser()` factory that returns an object with a `feed(chunk: string)` method, without owning the stream reader. This supports long-lived MCP connections.
2. Refactor `mcp-client.ts` `connectSseTransport()` to use `createSseParser` instead of hand-rolled line parsing.
3. Keep `parseSseStream()` as-is for the one-shot consume-and-done use case in `index.ts`.

## Affected files
- `src/main/sse-parser.ts` — add `createSseParser` export
- `src/main/mcp-client.ts` — replace inline SSE parsing

## Acceptance criteria
1. `mcp-client.ts` no longer contains `line.startsWith("data:")` or `line.startsWith("event:")`.
2. `sse-parser.ts` exports `createSseParser` in addition to `parseSseStream`.
3. `pnpm typecheck` passes.
4. `pnpm test` passes.
5. `pnpm build` passes.
