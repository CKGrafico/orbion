## Context

The LogViewer component in LoopDetail renders loop output as a flat `string[]`, each line becoming a `<div>` with optional CSS classes from `classifyLine()`. The chat system already has a mature transcript architecture: a `TranscriptRow` discriminated union, `useTranscript` hook for row-building, `MarkdownContent` for markdown+code-block rendering, and styled tool-call rows. The `StreamEventPayload` IPC type includes `"event"` as a valid kind but the stream handler in `api.ts` silently ignores it. Every `LoopMeta` carries a `runHistory: RunRecord[]` with per-run metadata (runNumber, exitCode, duration, logOffset, status) that is not surfaced in the UI.

Key constraints:
- Renderer has NO direct network access; all HTTP runs through main process via `window.api` bridge
- The app is read-only; no mutation of loop-task state
- i18n is mandatory for all user-facing strings
- Plain CSS with custom-property design tokens; no CSS framework
- Function components with hooks only; React 19

## Goals / Non-Goals

**Goals:**
- Allow users to navigate between runs in a loop via a run selector in LoopDetail
- Replace flat text log rendering with structured, component-based rows that mirror the Claude Desktop / harness UX
- Wire up the "event" stream kind so structured log events are parsed and rendered appropriately
- Reuse the existing chat transcript patterns (discriminated union rows, MarkdownContent, tool-call styles)
- Maintain backward compatibility: plain text stdout continues to work for simple commands (echo, scripts)

**Non-Goals:**
- Per-run log fetching from a daemon API endpoint (logOffset is not yet backed by a confirmed endpoint; we will fetch all logs and segment client-side)
- Interactive approval flow within the log viewer (the app is read-only)
- Server-side filtering or pagination of logs
- Changes to the main process IPC layer beyond what already exists in `StreamEventPayload`

## Decisions

### 1. Client-side run segmentation rather than per-run API

`RunRecord.logOffset` exists, but there is no confirmed daemon endpoint for per-run log fetching. The current `GET /api/loops/{id}/logs?tail=200` returns all recent logs. We will parse the flat log text client-side using the `=== Run #` markers already emitted by the daemon, segmenting lines into per-run buckets. This avoids needing a new API contract. If a per-run API is added later, the segmentation logic can be replaced.

Alternative considered: Add a `fetchRunLogs(env, loopId, runNumber)` API function. Rejected because the daemon endpoint is unconfirmed and may not exist yet.

### 2. LogRow discriminated union mirroring TranscriptRow

Define a `LogRow` type with kinds: `run-header`, `tool-call`, `markdown`, `plain-text`, `exit`, `approval`. This mirrors the chat system's `TranscriptRow` pattern but is tailored for log output. Do NOT reuse `TranscriptRow` directly because the row types differ (e.g., no user-message, no question-request; run-header and exit are log-specific).

### 3. Hybrid rendering: structured events + plain text fallback

When the stream delivers `kind === "event"`, parse the JSON payload and create the appropriate structured row. When `kind === "data"`, the line is plain text and gets categorized: if it matches `=== Run #` it becomes a `run-header` row, if it matches exit patterns it becomes an `exit` row, otherwise it is a `plain-text` row. This ensures backward compatibility with daemons that only emit text.

### 4. Run selector as an inline panel, not a sidebar

The run selector appears as a collapsible panel above the log viewer within the existing LoopDetail layout. It shows a compact list of recent runs with status dots and basic metadata. This avoids a major layout restructure and keeps the focus on log content. Selecting a run scrolls the log viewer to that run's header row.

### 5. Collapsible run cards within the log viewer

Each run is rendered as a collapsible card within the log viewer. The card header shows run number, status dot, exit code, duration, and timestamp. Expanding a card reveals its structured log rows (tool calls, markdown content, plain text). Collapsed cards show only the header, providing quick scanning.

## Risks / Trade-offs

- [Client-side segmentation may break if daemon log format changes] The `=== Run #` pattern is the existing classification pattern; if the daemon changes it, segmentation fails. Mitigation: the plain-text fallback still renders all lines, just without run grouping.
- [Parsing "event" JSON may fail if daemon emits unexpected shapes] Mitigation: wrap JSON.parse in try/catch and fall back to plain-text row.
- [Large log volumes with 2000-line cap may span many runs] Mitigation: the MAX_LINES cap already exists; run cards for runs beyond the cap simply won't appear.
- [Adding structured components increases LogViewer complexity] Mitigation: each row type is a small, testable component. The `useLogRows` hook encapsulates row-building logic.
