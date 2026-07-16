# structured-log-rendering Specification

## Purpose
TBD - created by archiving change loop-detail-run-selector-log-rendering. Update Purpose after archive.
## Requirements
### Requirement: LogRow discriminated union type
The system SHALL define a `LogRow` discriminated union type with the following kinds: `run-header`, `tool-call`, `markdown`, `plain-text`, `exit`, `approval`. Each kind SHALL carry the necessary data for its specific rendering. The `kind` field SHALL be the discriminant.

#### Scenario: LogRow types are distinguishable
- **WHEN** a LogRow is created
- **THEN** its `kind` field uniquely identifies the row type and TypeScript narrows the type accordingly

### Requirement: LogViewer renders structured rows instead of plain text
The LogViewer component SHALL render log output using the `LogRow` discriminated union instead of a flat `string[]`. Each row kind SHALL have its own rendering component. Plain text lines SHALL be rendered with monospace styling. Run header lines SHALL be rendered as collapsible run card headers. Exit lines SHALL display exit code and duration with color-coded status. Tool call lines SHALL display an icon, title, status, and expandable output area. Markdown lines SHALL be rendered using the existing `MarkdownContent` component.

#### Scenario: Run header row renders as collapsible card header
- **WHEN** a log line matches the `=== Run #` pattern
- **THEN** it is rendered as a run card header showing run number, status dot, and timestamp
- **AND** clicking the header toggles the card's expanded state

#### Scenario: Plain text row renders in monospace
- **WHEN** a log line does not match any structured pattern
- **THEN** it is rendered as a monospace text line within the current run card

#### Scenario: Exit row renders with status colors
- **WHEN** a log line matches an exit code pattern (e.g., `exit 0` or `exit N`)
- **THEN** it is rendered with the exit code and appropriate color (green for 0, red for non-zero)

#### Scenario: Tool call row renders with icon and expandable output
- **WHEN** a structured event with tool call data is received
- **THEN** it renders with a tool-kind icon, status indicator, title, and collapsible output panel

#### Scenario: Markdown row renders rich content
- **WHEN** a structured event with markdown content is received
- **THEN** it is rendered using the MarkdownContent component with syntax-highlighted code blocks

### Requirement: Run cards group log rows by run
Each run SHALL be rendered as a collapsible card containing all log rows for that run. The card header SHALL show the run number, status dot, exit code (when available), duration (when available), and timestamp. When collapsed, only the header is visible. When expanded, all rows within that run are visible.

#### Scenario: Multiple runs render as separate cards
- **WHEN** the log output contains lines for multiple runs (separated by `=== Run #` markers)
- **THEN** each run is rendered as a separate collapsible card

#### Scenario: Collapsed card shows only header
- **WHEN** a run card is collapsed
- **THEN** only the run header (number, status, exit code, duration) is visible

#### Scenario: Expanded card shows all rows
- **WHEN** a run card is expanded
- **THEN** all log rows within that run are visible in sequence

### Requirement: Backward compatibility with plain text logs
When the daemon emits plain text logs only (no structured events), the LogViewer SHALL still render all lines. Plain text lines SHALL be categorized into run-header, exit, or plain-text row types using pattern matching on the existing `=== Run #` and exit code patterns. Logs that do not contain any run markers SHALL render as a single group of plain-text rows.

#### Scenario: Simple echo command output renders correctly
- **WHEN** a loop runs `echo hello` and the log output is just "hello"
- **THEN** it renders as a plain-text row within the current run card

#### Scenario: Logs without run markers render as plain text
- **WHEN** log output contains no `=== Run #` markers
- **THEN** all lines render as plain-text rows within a default run card

