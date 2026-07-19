## Context

The main process SSE stream handler (`src/main/index.ts`, `handleStreamSubscribe`, lines 423-439) uses a hand-rolled parser that splits on `\n\n` and iterates lines looking for `data:` and `event:` prefixes. This parser violates the SSE specification in three ways: it does not concatenate multi-line `data:` values, it does not handle `\n\n` split across chunk boundaries, and it ignores `id:`, `retry:`, and comment lines.

The renderer (`src/renderer/src/api.ts`) already correctly processes `StreamEventPayload` objects with `kind: "data"` and `kind: "event"`. The bug lies entirely in the main process parser. The fix is scoped to the main process with no renderer or IPC contract changes.

## Goals / Non-Goals

**Goals:**
- Replace the hand-rolled parser with a spec-compliant SSE parser
- Extract parsing logic into a pure, testable module (following the project pattern for `ConnectionSupervisor`, `fleet-status`, etc.)
- Handle multi-line `data:` concatenation per spec (join with `\n`)
- Handle chunk-boundary splits (where `\n\n` spans two reads)
- Ignore `id:`, `retry:`, and comment lines per spec
- Add comprehensive unit tests covering all edge cases from the bug report

**Non-Goals:**
- Exposing `id:` or `retry:` values to the renderer (not needed in v1)
- Changing the `StreamEventPayload` IPC contract
- Modifying renderer-side SSE consumption code
- Supporting BOM or non-UTF-8 encodings beyond what `TextDecoder` already handles

## Decisions

### Decision 1: Use `eventsource-parser` instead of writing a custom parser

**Choice:** Add `eventsource-parser` npm package.

**Rationale:** The eventsource-parser package is lightweight (~1KB), streaming-compatible, spec-compliant, and battle-tested (used by Vercel AI SDK). Writing a custom spec-compliant parser would require handling edge cases like CR+LF line endings, BOM, empty data fields, and comment processing. Using a well-tested library eliminates an entire category of bugs.

**Alternative considered:** Write a minimal spec-compliant parser in-house. Rejected because the spec has subtle edge cases and the existing code already demonstrates the risk of hand-rolled parsing. The `eventsource-parser` package has zero dependencies and is maintained by Vercel.

### Decision 2: Extract into a pure module `src/main/sse-parser.ts`

**Choice:** Create `sse-parser.ts` as a pure module that accepts a `ReadableStream<Uint8Array>` and a callback, with no Electron imports.

**Rationale:** Following the project's established pattern (ConnectionSupervisor, classifyError, fleet-status), pure logic is extracted from Electron-coupled code into testable modules. The test files in `tests/` verify pure functions without Electron mocks.

### Decision 3: Dispatch consolidated events, not per-line data

**Choice:** When a spec-compliant SSE event has multiple `data:` lines, the parser SHALL concatenate them with `\n` and emit a single `data` kind message to the renderer.

**Rationale:** The current bug sends each `data:` line as a separate message, corrupting payloads. The spec requires concatenation. The renderer already expects complete payloads per `data` kind message.

### Decision 4: Preserve `event` field dispatching behavior

**Choice:** The `event:` field SHALL be dispatched as a separate `event` kind message before the `data` messages for that event block, matching current behavior for events that have both `event:` and `data:` lines.

**Rationale:** The renderer's `api.ts` processes `event` and `data` kinds independently. Maintaining current dispatch ordering ensures no renderer changes are needed.

## Risks / Trade-offs

- **New dependency:** `eventsource-parser` adds a dependency. Mitigation: it has zero transitive dependencies, is maintained by Vercel, and is smaller than the code we would need to write.
- **Behavioral change in data dispatch:** Multi-line `data:` payloads will now be dispatched as one concatenated message instead of multiple partial messages. Any code that relied on the broken behavior (receiving partial messages) will break. Mitigation: the broken behavior could never produce valid JSON from multi-line data, so no working code depends on it.
- **Chunk-boundary fix may change timing:** Events that were previously missed or merged due to chunk-boundary issues will now be correctly dispatched. Mitigation: this is strictly a bug fix.
