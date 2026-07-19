# Tasks: Log tail inside the loop card

## Task 1: Add i18n keys for log tail section

**Tier**: fast  
**Touches**: `src/renderer/src/i18n/en.json`  
**Depends on**: —

### What
Add four new i18n keys under `loopCard`:
- `outputLabel`: "OUTPUT" — the uppercase label for the log section
- `copy`: "Copy" — the copy button text
- `copied`: "Copied" — transient confirmation after copy
- `logUnavailable`: "unavailable" — shown when the instance is unreachable

### Verification
- `pnpm typecheck` passes

---

## Task 2: Add CSS for log tail section in LoopCard

**Tier**: fast  
**Touches**: `src/renderer/src/theme.css`  
**Depends on**: —

### What
Add CSS classes for the new log tail section inside `.loop-card`:

- `.loop-card-log-tail` — wraps the entire log section (bordered, rounded, monospace)
- `.loop-card-log-tail-header` — flex row with uppercase label + copy button
- `.loop-card-log-tail-label` — uppercase tracked overline (matches `.overline` style)
- `.loop-card-log-tail-copy` — small text button (matches existing `.toggle` copy pattern)
- `.loop-card-log-tail-content` — scrolling container with dark `bg_log` background
- `.loop-card-log-tail-line` — monospace log line (12px, `var(--text-secondary)`)
- `.loop-card-log-tail-line--error` — danger color variant (`var(--danger)`)

Design direction:
- Background: `#0b111b` (same as `.log-viewer`)
- Border: `1px solid var(--border-subtle)`
- Content max-height: ~120px (enough for ~7 lines) with overflow-y auto
- Font: `var(--font-mono)` at 11.5px
- The copy button uses the existing small `toggle` style

### Verification
- `pnpm typecheck` passes

---

## Task 3: Add instance prop to LoopCard and fetch/render log tail

**Tier**: build  
**Touches**: `src/renderer/src/components/LoopCard.tsx`  
**Depends on**: [1, 2]

### What
1. Add an optional `instance` prop of type `Environment` to `LoopCardProps`.
2. Import `fetchLogs` from `../api` and `classifyLogLine` from `./log-types`.
3. Add state: `logLines: string[]`, `copied: boolean`, `logLoading: boolean`.
4. In a `useEffect` keyed on `instance.id`, `instance.activeEndpointId`, and `loop.id`:
   - If `instance` is not provided or `reachability` indicates unreachable: set `logLines` to empty, skip fetch.
   - Otherwise: set `logLoading = true`, call `fetchLogs(instance, loop.id, 10)`.
   - On success: split the response string by `\n`, filter empty strings, set `logLines`.
   - On failure: set `logLines` to empty.
   - Set `logLoading = false`.
5. Add a `copyLogs` handler: writes `logLines.join("\n")` to clipboard, sets `copied = true`, resets after 1500ms.
6. Render the log tail section after the meta row (only if `instance` is provided AND `isReachable`):
   - If `logLoading`: show a faint "…" placeholder
   - If `logLines.length === 0`: show nothing (no section at all)
   - Otherwise: render the structured log tail with header (label + copy) and content lines
7. For each line, use `classifyLogLine` to detect error lines. Lines with `kind === "exit"` and `exitCode > 0` get the `loop-card-log-tail-line--error` class.
8. Use the `useIntl` hook (already present) for all new label strings.

### Important
- The `instance` prop is optional so existing callers of `LoopCard` continue to work without changes.
- When `instance` is not provided, the card renders exactly as before (no log section).
- No mock adapter changes needed: `fetchLogs` already works in mock mode via the DI container.

### Verification
- `pnpm typecheck` passes
- LoopCard renders with log tail when instance is provided
- Card without instance prop renders identically to before
- Error lines show in red/danger color
- Copy button copies log text to clipboard
