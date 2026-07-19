# Spec: Loop card log tail component

## Data flow
1. `LoopCard` receives `loop` and `reachability` props (existing).
2. On mount (and when `instance.id` or `loop.id` changes), if `reachability === "connected"` or `undefined`, call `fetchLogs(env, loopId, TAIL_SIZE)`.
3. The response is a plain string. Split on newlines, filter empty lines, take the last `TAIL_SIZE` lines.
4. Render lines in a monospace block; classify each line via `classifyLogLine` from `log-types.ts` — lines with `kind: "exit"` and `exitCode !== 0` get the danger color.
5. Copy button writes the raw string to the clipboard and shows a transient "Copied" confirmation (1.5s timeout, matching the `LogViewer` pattern).

## Component structure
```
<div class="loop-card">
  <header> ... existing ... </header>
  <meta>   ... existing ... </meta>
  <div class="loop-card-log-tail">
    <div class="loop-card-log-tail-header">
      <span class="loop-card-log-tail-label">OUTPUT</span>
      <button class="loop-card-log-tail-copy">Copy</button>
    </div>
    <div class="loop-card-log-tail-content">
      {lines.map(line => <div class="loop-card-log-tail-line [error]">line</div>)}
    </div>
  </div>
</div>
```

## New props required
The `LoopCard` component currently does not receive an `Environment` instance. It needs one to call `fetchLogs`. Add an optional `instance` prop of type `Environment` to the `LoopCardProps` interface. This aligns with the existing `LogViewer` pattern which receives an `instance` prop.

## Error line detection
Reuse `classifyLogLine` from `log-types.ts`. A line is classified as an error when:
- It matches the `exit <non-zero>` pattern → `kind: "exit"`, `exitCode > 0`

## i18n keys
- `loopCard.outputLabel` → "OUTPUT"
- `loopCard.copy` → "Copy"
- `loopCard.copied` → "Copied"
- `loopCard.logUnavailable` → "unavailable"

## CSS tokens
All colors and fonts use existing design tokens. No new CSS custom properties are introduced.
