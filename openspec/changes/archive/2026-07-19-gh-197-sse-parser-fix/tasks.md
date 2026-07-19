## 1. Dependencies & Module Setup

- [x] 1.1 Add `eventsource-parser` dependency to package.json <!-- agent: frontend-engineer.build, depends_on: [], touches: [package.json] -->

## 2. Core SSE Parser Module

- [x] 2.1 Create `src/main/sse-parser.ts` with a spec-compliant SSE parser function that accepts a `ReadableStream<Uint8Array>` and a callback, uses `eventsource-parser` to parse events, concatenates multi-line `data:` fields, handles chunk-boundary splits, and ignores `id:`/`retry:`/comment lines <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/sse-parser.ts] -->

## 3. Integration

- [x] 3.1 Refactor `handleStreamSubscribe` in `src/main/index.ts` to use the new `sse-parser.ts` module, removing the hand-rolled `buffer.indexOf("\n\n")` parsing loop <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/main/index.ts] -->

## 4. Tests

- [x] 4.1 Create `tests/sse-parser.test.ts` with comprehensive unit tests covering: single data line, multi-line data concatenation, event with both event type and data, chunk boundary split, id/retry fields ignored, comment lines ignored, multiple events in single chunk, empty data field <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [tests/sse-parser.test.ts] -->

## 5. Verification

- [x] 5.1 Run `pnpm typecheck` and fix any errors <!-- agent: frontend-engineer.fast, depends_on: [3.1, 4.1], touches: [] -->
- [x] 5.2 Run `pnpm test` and ensure all tests pass <!-- agent: frontend-engineer.fast, depends_on: [4.1], touches: [] -->
