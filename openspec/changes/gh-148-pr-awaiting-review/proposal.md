# PR-awaiting-review as an inbox notification type

## Issue

GitHub Issue #148 — As a user whose loops open PRs unattended, I want each new PR awaiting my review to land in the inbox.

## Summary

Add a new inbox item kind `pr-awaiting-review` that surfaces open PRs requiring the user's review. The system periodically checks configured projects via the platform CLI (`gh pr list --search review-needed`) on the main VM instance and creates typed inbox items for new PRs. Items self-resolve when the PR merges/closes or the review is submitted.

## Acceptance Criteria

1. Orbion periodically polls the main VM for open PRs awaiting the user's review via `gh pr list` with a `review-required` search filter.
2. Each PR generates an inbox item of kind `pr-awaiting-review` carrying: repo/project, number, title, author.
3. PR items show inline actions: dismiss and open-in-chat.
4. Items self-resolve when the PR is no longer open or review is no longer required (detected on next poll).
5. The mock adapter provides sample PR items for browser-only development.
6. i18n keys are added for all new UI strings.
7. The existing polling cadence (~5s for loops) is reused; a separate slower cadence (60s) is used for PR checks to avoid over-polling GitHub.

## Design Decisions

- **Polling via `gh` CLI on main VM**: follows the existing infra action pattern (`list-issues`, `create-issue`) where the main process executes `gh` commands. The `gh pr list --search review-required` command returns PRs that need the authenticated user's review.
- **Per-environment PR state in InboxBuildParams**: PR items are stored alongside loops/breaches in the inbox derivation pipeline. A new `prAwaitingReview` field on `InboxBuildParams` carries the polled PR data.
- **PR polling in the renderer**: following the existing architecture, the renderer initiates data fetching. A new `IPrPollingService` is added that periodically calls the `list-prs-awaiting-review` infra action and holds the current PR list in state.
- **Self-resolution**: PR items auto-resolve when they disappear from the `gh pr list` results (PR merged, closed, or review submitted). This follows the same auto-resolution pattern as failed-loop items.
- **No new nav pillar**: PR items appear in the existing inbox surface. This is consistent with the design model: "A PR is a notification type, not its own page."

## Scope

This change does NOT implement:
- PR review mode (separate issue)
- Detailed inline actions beyond dismiss/open-in-chat (later issue)
- Azure DevOps PR listing (only `gh` is supported; `az` doesn't have a comparable review-needed filter)
