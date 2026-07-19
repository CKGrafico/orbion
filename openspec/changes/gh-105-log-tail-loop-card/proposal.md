# Proposal: Log tail inside the loop card

## Change ID
gh-105-log-tail-loop-card

## Source
GitHub Issue #105

## User Story
As a user, I want the last lines of a loop's output on its card, so I see what happened without opening anything.

## Acceptance Criteria
1. Card includes a monospace log section fetched via the logs endpoint (tail), with a copy affordance.
2. Error lines render in the alert color.

## Description
The `LoopCard` component currently shows status, interval, runs, last exit code, and next run time. This change adds a compact, read-only log tail section below the meta row. The section displays the last N lines from the loop-task `/api/loops/:id/logs?tail=N` endpoint, rendered in monospace on the darkest background. Lines that match the exit-code-error pattern (non-zero exit) render in the danger color. A small "Copy" affordance (matching the existing LogViewer pattern) lets users copy the log text.

## Design Decisions
- **Tail size**: 10 lines — compact enough for the card, sufficient contextual output.
- **Fetch-on-mount**: The card fetches the tail once on mount and whenever the loop ID or instance changes. Live streaming is explicitly out of scope for the card (use the LogViewer for that).
- **No live updates in the card**: The LoopCard is already rendered as a compact component in the chat stream. Adding SSE would be noisy and conflict with the "read at a glance" intent. The card refreshes when the parent re-renders with new loop data from the 5s poll.
- **Error line highlighting**: Lines containing `exit <non-zero>` patterns render in `var(--danger)`, matching the existing `log-exit-bad` style.
- **Copy affordance**: A small button in the log section header — same visual pattern as the LogViewer copy button, with a transient "Copied" confirmation.
- **Reachability**: If the instance is unreachable, the log section shows a muted "unavailable" message (no fetch attempt).

## Scope
- `src/renderer/src/components/LoopCard.tsx` — add log tail fetching and rendering
- `src/renderer/src/i18n/en.json` — add i18n keys for log section labels
- `src/renderer/src/theme.css` — add CSS for the log tail section within `.loop-card`
