## Why

The SSE stream parser in `src/main/index.ts` (`handleStreamSubscribe`, lines 423-439) uses a naive `buffer.indexOf("\n\n")` approach that has three critical flaws: (1) multi-line `data:` values are split into separate `stream:event` messages, silently corrupting payloads; (2) chunk boundaries that split `\n\n` across two reads are not detected, causing event loss or merge; (3) `id:`, `retry:`, and comment lines are not handled per spec, risking data pollution. This is severity 8/10 as the SSE path is the primary channel for real-time state updates from remote VMs.

## What Changes

- Replace the hand-rolled SSE parsing logic in `handleStreamSubscribe` with a spec-compliant SSE parser that correctly handles multi-line `data:` concatenation, chunk-boundary splits, `id:`, `retry:`, and comment lines
- Add `eventsource-parser` as a dependency (lightweight, streaming-compatible, spec-compliant)
- Extract the SSE parsing into a pure, testable module (`src/main/sse-parser.ts`) following the project's established pattern of extracting logic from Electron-coupled code
- Add comprehensive unit tests covering all edge cases from the bug report
- The `StreamEventPayload` IPC contract (`src/shared/ipc.ts`) remains unchanged: the renderer already handles `data` and `event` kinds correctly once the main process sends them properly

## Capabilities

### New Capabilities
- `sse-spec-parser`: A spec-compliant SSE parser module that replaces the hand-rolled parser, handling multi-line data concatenation, chunk-boundary splits, id/retry/comment lines, and dispatching correctly typed events

### Modified Capabilities
- `event-stream-handling`: The main-process SSE handler now uses the spec-compliant parser instead of the naive `\n\n` split, fixing data corruption and event loss bugs while preserving the existing `StreamEventPayload` contract

## Impact

- `src/main/index.ts` - `handleStreamSubscribe` function refactored to use the new parser module
- `src/main/sse-parser.ts` (new) - Pure SSE parser module, testable without Electron mocks
- `tests/sse-parser.test.ts` (new) - Comprehensive unit tests
- `package.json` - Add `eventsource-parser` dependency
- `src/shared/ipc.ts` - No changes (contract preserved)
- Renderer code - No changes (already handles events correctly)
