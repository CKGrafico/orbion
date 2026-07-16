## 1. Types and Data Model

- [ ] 1.1 Define `LogRow` discriminated union type in `src/renderer/src/components/log-types.ts` with kinds: `run-header`, `tool-call`, `markdown`, `plain-text`, `exit`, and supporting interfaces (`RunHeaderRow`, `ToolCallLogRow`, `MarkdownLogRow`, `PlainTextRow`, `ExitRow`)
- [ ] 1.2 Add structured event type definitions in `src/shared/ipc.ts` (or a new `src/renderer/src/components/log-types.ts`) for parsed event payloads: `LogEventPayload` with discriminated subtypes for tool-call events and markdown events

## 2. Stream Event Handling

- [ ] 1.3 Add `onEvent` callback to `LogStreamHandlers` interface in `src/renderer/src/api.ts`
- [ ] 1.4 Update `ensureGlobalListener` in `api.ts` to handle `kind === "event"`: parse JSON, call `onEvent` if present, fall back to `onLine` with raw text if not
- [ ] 1.5 Update `subscribeLogs` function signature to accept optional `onEvent` callback parameter

## 3. Log Row Builder Hook

- [ ] 2.1 Create `src/renderer/src/components/useLogRows.ts` hook that converts flat log lines and structured events into `LogRow[]`
- [ ] 2.2 Implement line classification logic: match `=== Run #` pattern to `run-header`, exit patterns to `exit`, everything else to `plain-text`
- [ ] 2.3 Implement structured event routing: tool-call events to `tool-call` rows, markdown events to `markdown` rows
- [ ] 2.4 Implement run segmentation: group rows into per-run buckets based on `run-header` markers
- [ ] 2.5 Implement run card state management (expanded/collapsed per run)

## 4. Log Viewer Component Rewrite

- [ ] 3.1 Rewrite `LogViewer.tsx` to use `useLogRows` hook and render `LogRow[]` instead of `string[]`
- [ ] 3.2 Create `RunCard` component that renders a collapsible card with header (run number, status dot, exit code, duration, timestamp) and expandable content area
- [ ] 3.3 Create `RunHeaderRow` rendering component
- [ ] 3.4 Create `PlainTextRow` rendering component (monospace)
- [ ] 3.5 Create `ExitRow` rendering component (color-coded exit status)
- [ ] 3.6 Create `ToolCallLogRow` rendering component (icon + status + expandable output, reusing patterns from chat `MarkdownContent.tsx`)
- [ ] 3.7 Create `MarkdownLogRow` rendering component (reuse `MarkdownContent` component)
- [ ] 3.8 Integrate all row components in LogViewer with proper keying and virtualization awareness

## 5. Run Selector in LoopDetail

- [ ] 4.1 Create `RunSelector` component displaying `LoopMeta.runHistory` entries in reverse chronological order
- [ ] 4.2 Add status dot coloring logic: blue for running, green for exit 0, red for non-zero exit
- [ ] 4.3 Add click handler that scrolls LogViewer to the selected run's card
- [ ] 4.4 Add collapsible behavior: collapsed state shows only latest run summary, expanded shows all
- [ ] 4.5 Integrate `RunSelector` into `LoopDetail.tsx` above the LogViewer

## 6. Styling

- [ ] 5.1 Add run card CSS styles to `theme.css`: card container, header, collapse toggle, status dots
- [ ] 5.2 Add tool-call log row CSS styles (can reuse/adapt `.tool-call-*` patterns from chat)
- [ ] 5.3 Add run selector panel CSS styles: list layout, entry hover, selected state
- [ ] 5.4 Add exit row and plain-text row styles for monospace and color-coded status

## 7. i18n

- [ ] 6.1 Add i18n keys to `en.json` for run selector labels (`runSelector.title`, `runSelector.runN`, `runSelector.collapsed`, etc.)
- [ ] 6.2 Add i18n keys for structured log row labels (`logRows.runHeader`, `logRows.exitCode`, `logRows.duration`, `logRows.completed`, `logRows.failed`, `logRows.running`)

## 8. Verification

- [ ] 7.1 Run `pnpm typecheck` and fix any type errors
- [ ] 7.2 Run `pnpm dev:web` and verify the UI renders correctly with mock data
