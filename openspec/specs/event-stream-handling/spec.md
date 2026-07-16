# event-stream-handling Specification

## Purpose
TBD - created by archiving change loop-detail-run-selector-log-rendering. Update Purpose after archive.
## Requirements
### Requirement: Event stream kind is handled in stream subscriber
The stream handler in `api.ts` SHALL process `StreamEventPayload` instances where `kind === "event"` instead of silently ignoring them. When an event payload is received, the handler SHALL attempt to parse the `text` field as JSON and route the parsed structure to the appropriate log row type. If JSON parsing fails, the text SHALL be treated as a plain-text line.

#### Scenario: Structured event received and parsed
- **WHEN** a `StreamEventPayload` with `kind: "event"` is received and `text` contains valid JSON
- **THEN** the parsed object is routed to the appropriate log row builder based on its structure

#### Scenario: Malformed event falls back to plain text
- **WHEN** a `StreamEventPayload` with `kind: "event"` is received and `text` is not valid JSON
- **THEN** the text is treated as a plain-text log line

#### Scenario: Event with tool call structure creates tool-call row
- **WHEN** a parsed event contains a `tool` or `type: "tool_call"` field
- **THEN** a `tool-call` LogRow is created with the tool kind, title, status, and output

#### Scenario: Event with markdown content creates markdown row
- **WHEN** a parsed event contains a `content` field with markdown text
- **THEN** a `markdown` LogRow is created

### Requirement: Subscribe logs callback accepts structured events
The `subscribeLogs` function signature SHALL support an optional `onEvent` callback that receives parsed structured events. The existing `onLine` callback SHALL continue to receive plain text lines for backward compatibility. When no `onEvent` callback is provided, structured events SHALL be converted to plain text lines via JSON.stringify.

#### Scenario: onEvent callback receives structured data
- **WHEN** `subscribeLogs` is called with an `onEvent` callback
- **THEN** structured events are passed to `onEvent` as parsed objects

#### Scenario: Missing onEvent callback falls back to text
- **WHEN** `subscribeLogs` is called without an `onEvent` callback and a structured event arrives
- **THEN** the event text is passed to `onLine` as a raw string

