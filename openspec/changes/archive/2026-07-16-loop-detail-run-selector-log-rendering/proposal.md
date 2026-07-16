## Why

The LogViewer renders loop output as flat monospace text lines with minimal classification (run headers, exit codes). Meanwhile, the codebase already has a rich chat transcript system with structured rows, markdown rendering, and tool call components that could be reused. The `StreamEventPayload` type includes an "event" kind that is silently ignored in the stream handler, indicating structured event support was planned but never wired up. With `RunRecord[]` already available on every `LoopMeta`, the data needed for per-run navigation exists but is not surfaced in the UI.

## What Changes

- Add a run selector to LoopDetail that shows `LoopMeta.runHistory` entries as a sidebar list or dropdown, displaying run number, status, exit code, duration, and timestamp
- Replace the plain-text `string[]` LogViewer with a structured row system using a discriminated union (`LogRow`), similar to the existing `TranscriptRow` pattern from the chat system
- Wire up the `"event"` stream kind in `api.ts` to parse structured JSON events and route them to appropriate component row types
- Create collapsible run cards that group log rows per run, with status dots, expandable tool call components, markdown-rendered output, and plain monospace text for simple commands
- Add i18n keys for all new user-facing strings in the run selector and log row components
- Add CSS styles for run cards, tool call rows, and run selector leveraging the existing design token system

## Capabilities

### New Capabilities
- `run-selector`: Run history sidebar in LoopDetail allowing navigation between runs with status indicators, exit codes, and timestamps
- `structured-log-rendering`: Component-based log rendering with discriminated union row types (run headers, tool calls, markdown, plain text, exit rows) replacing flat text lines
- `event-stream-handling`: Wire up the "event" stream kind to parse structured JSON events and route them to appropriate log row components

### Modified Capabilities

## Impact

- `src/renderer/src/components/LogViewer.tsx` - complete rewrite to component-based rows
- `src/renderer/src/components/LoopDetail.tsx` - add run selector panel
- `src/renderer/src/api.ts` - wire up "event" stream kind, add per-run log fetch function
- `src/renderer/src/types.ts` - new `LogRow` discriminated union types
- `src/shared/ipc.ts` - possible new structured event types for `StreamEventPayload`
- `src/renderer/src/theme.css` - run card styles, tool call components, run selector styles
- `src/renderer/src/i18n/en.json` - new i18n keys for run selector and structured log rows
