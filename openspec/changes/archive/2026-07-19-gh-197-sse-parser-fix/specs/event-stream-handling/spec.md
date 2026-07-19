## MODIFIED Requirements

### Requirement: Event stream kind is handled in stream subscriber
The stream handler in the main process SHALL use a spec-compliant SSE parser to process incoming `text/event-stream` responses. When an SSE event is parsed, the handler SHALL dispatch `StreamEventPayload` messages to the renderer with the correct `kind` and `text`. Multi-line `data:` fields SHALL be concatenated with `\n` before dispatch as a single `data` kind message. The `event:` field SHALL be dispatched as a separate `event` kind message. Lines starting with `id:`, `retry:`, or `:` SHALL be processed by the parser but SHALL NOT trigger any dispatch to the renderer.

#### Scenario: Structured event received and parsed
- **WHEN** a `StreamEventPayload` with `kind: "event"` is received and `text` contains valid JSON
- **THEN** the parsed object is routed to the appropriate log row builder based on its structure

#### Scenario: Malformed event falls back to plain text
- **WHEN** a `StreamEventPayload` with `kind: "event"` is received and `text` is not valid JSON
- **THEN** the text is treated as a plain-text log line

#### Scenario: Multi-line data fields are concatenated
- **WHEN** the SSE stream delivers an event with multiple `data:` lines
- **THEN** the data values are concatenated with `\n` and dispatched as a single `data` kind `StreamEventPayload`

#### Scenario: Chunk boundary does not break event parsing
- **WHEN** the `\n\n` boundary is split across two chunk reads
- **THEN** the parser correctly detects the event boundary and dispatches the event

#### Scenario: id and retry fields do not pollute data
- **WHEN** the SSE stream delivers `id:` or `retry:` lines
- **THEN** no `StreamEventPayload` is dispatched for those lines, and subsequent data events are not corrupted
