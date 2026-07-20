# Review queue strip for PR batches

## Issue

GitHub Issue #152 — As a user reviewing a batch, I want a left strip listing every PR with status + one-line verdict, so I can work down the queue.

## Summary

Add a left-side queue strip to the PR review mode overlay. When the user enters review mode from an inbox PR notification (or a digest), the strip shows the full batch of PRs originating from the same project/repo context. Each PR row displays: PR number, title, one-line agent verdict, and a tick-off indicator for disposed PRs (approved/changes-requested). Selecting a PR in the strip loads it in the main review area. The strip replaces the bare single-PR placeholder body with a two-column layout: narrow queue strip on the left, main review area on the right.

## Acceptance Criteria

1. Review mode shows a queue strip on the left listing every PR in the current review batch.
2. Each PR row shows: number, truncated title, one-line verdict text, risk chip.
3. Disposed PRs (approved/changes-requested) show a ticked-off indicator (checkmark + muted style).
4. Selecting a PR row in the strip loads that PR in the main review area (header + body).
5. The currently selected PR is visually highlighted in the strip.
6. The strip is scrollable when the batch exceeds the viewport height.
7. The mock adapter provides sample review-queue data for browser-only development.
8. i18n keys are added for all new UI strings.
9. The existing review mode overlay CSS is extended (not replaced) to accommodate the two-column layout.

## Design Decisions

- **Batch scope: all PRs awaiting review from the same source.** When entering review mode from an inbox PR or digest, the batch includes all PRs in the `prAwaitingReview` list that share the same environment/project context (i.e. all PRs from the main VM's polling). This is consistent with the design model's "queue" language and avoids requiring a new grouping concept.
- **ReviewModeService now holds a batch of items.** The existing `IReviewModeService.enter(item)` API is extended with `enterBatch(items, selectedIndex)` to carry the full queue. The single `enter(item)` call is preserved for backward compatibility (it creates a batch of one).
- **Disposed state tracked locally.** PR disposal (approved/changes-requested) is tracked in the ReviewModeService as a set of PR identifiers. This is a UI-only state that does not persist; on next review-mode entry, all PRs are undisposed. When the PR disappears from the polling results (self-resolution), the inbox item auto-resolves and the review queue updates.
- **Two-column CSS layout.** The existing `.review-mode-container` gains a `display: grid; grid-template-columns: 280px 1fr` pattern. The existing header stays full-width across both columns. The new strip is a scrollable sidebar inside the body area.
- **No new service interfaces.** The ReviewModeService gains batch methods but no new DI-registered services are needed. PR data and verdicts already flow through existing services (PrPollingService, PrVerdictService).

## Scope

This change does NOT implement:
- The agent briefing / diff viewer in the main review area (separate issue).
- Approve / request-changes chat-style verbs (separate issue).
- Cross-PR conflict/duplicate detection (separate issue).
