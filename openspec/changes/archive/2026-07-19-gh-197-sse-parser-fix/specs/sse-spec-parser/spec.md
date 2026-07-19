## ADDED Requirements

### Requirement: Spec-compliant SSE stream parsing
The system SHALL parse Server-Sent Events streams in compliance with the HTML specification (WHATWG). The parser SHALL correctly handle multi-line `data:` field concatenation (joining values with `\n`), `event:` field dispatching, `id:` field tracking (without exposing to renderer), `retry:` field handling (without exposing to renderer), and comment lines (lines starting with `:`). The parser SHALL handle `\n\n` event boundaries even when the boundary is split across two chunk reads.

#### Scenario: Single data line event
- **WHEN** an SSE stream delivers `data: hello\n\n`
- **THEN** the parser emits a single event with data `hello`

#### Scenario: Multi-line data concatenation
- **WHEN** an SSE stream delivers `data: line1\ndata: line2\n\n`
- **THEN** the parser emits a single event with data `line1\nline2`

#### Scenario: Event with both event type and data
- **WHEN** an SSE stream delivers `event: update\ndata: payload\n\n`
- **THEN** the parser emits the event type `update` and data `payload`

#### Scenario: Chunk boundary splits the \n\n separator
- **WHEN** the first chunk ends with `data: hello\n` and the second chunk starts with `\npayload`
- **THEN** the parser correctly detects the event boundary and emits a single event with data `hello`

#### Scenario: id field is processed but not forwarded
- **WHEN** an SSE stream delivers `id: 42\ndata: hello\n\n`
- **THEN** the parser processes the `id` field and emits only the data event

#### Scenario: retry field is processed but not forwarded
- **WHEN** an SSE stream delivers `retry: 5000\ndata: hello\n\n`
- **THEN** the parser processes the `retry` field and emits only the data event

#### Scenario: Comment lines are ignored
- **WHEN** an SSE stream delivers `: this is a comment\ndata: hello\n\n`
- **THEN** the parser ignores the comment and emits only the data event

#### Scenario: Multiple events in single chunk
- **WHEN** a single chunk contains `data: first\n\ndata: second\n\n`
- **THEN** the parser emits two separate events with data `first` and `second`

#### Scenario: Empty data field
- **WHEN** an SSE stream delivers `data:\n\n` (data with no value after colon)
- **THEN** the parser emits a data event with an empty string value

### Requirement: SSE parser is a pure testable module
The SSE parsing logic SHALL be extracted into a pure module (`src/main/sse-parser.ts`) with no Electron imports. The module SHALL accept a `ReadableStream<Uint8Array>` and a callback function, enabling unit testing without Electron mocks.

#### Scenario: Module has no Electron dependencies
- **WHEN** the sse-parser module is imported
- **THEN** it has no import from `electron` or any Electron-specific module

#### Scenario: Parser can be tested with synthetic streams
- **WHEN** a test creates a `ReadableStream` from a string and passes it to the parser
- **THEN** the parser processes the stream and invokes the callback with correct events
