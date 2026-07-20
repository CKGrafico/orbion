# Proposal: Approve / request changes from review mode, plus open on web

## Summary

Add approve and request-changes actions to PR review mode so users can submit reviews without leaving the overlay, plus an "Open on web" button on both the review mode header and inbox PR items that launches the PR URL in the system browser.

## Motivation

Review mode currently lets users inspect PRs (briefing, diff) but requires leaving the overlay to submit an approving or changes-requested review. This breaks the async review flow. Additionally, there is no way to jump to the PR on the platform from inbox PR items.

## Scope

### In scope
- Approve action: submits an approving review via `gh pr review --approve` (GitHub) or equivalent platform CLI
- Request changes action: prompts for a comment and submits via `gh pr review --request-changes` (GitHub) or equivalent
- Platform adapter: GitHub review via `gh` CLI; ADO vote `az repos pr set-vote` if `az` is detected; unsupported operations hidden not faked
- "Open on web" button on inbox PR items
- "Open on web" link in the review mode header (already exists, generalized label)
- Results reflect on the queue strip (mark disposed) and resolve the inbox item
- Mock adapter counterparts

### Out of scope
- Comment-only reviews (separate follow-up)
- Inline line-level comments
- Review editing after submission
- ADO specific review policies beyond vote

## Design

1. **Two new infra actions**: `submit-pr-review` with params `{ repo, number, event: "APPROVE" | "REQUEST_CHANGES", body?: string }` and `open-pr-in-browser` with params `{ url: string }`.
2. **Main process handler**: `submit-pr-review` resolves the platform CLI (gh/az) and runs the appropriate command. For GitHub: `gh pr review <number> --repo <repo> --<event> [--body <comment>]`. For ADO: `az repos pr set-vote --id <id> --vote <approve|reject>`.
3. **Renderer service**: `IReviewModeService` gets `submitReview(repo, number, event, body?)` method that calls `executeAction({ action: "submit-pr-review", ... })` and on success calls `markDisposed` and triggers inbox resolution.
4. **UI**: Add Approve and Request Changes buttons to review mode header actions area. Request Changes opens a small inline comment input. "Open on web" already exists in the header; add equivalent to inbox PR items.
5. **Inbox PR items**: Add a visible "Open on web" link/button that calls `window.open(item.prUrl, "_blank")`.
6. **Queue strip reflection**: After successful review, the PR row shows the disposed (check) state.
7. **Platform gating**: Before showing approve/request-changes buttons, check if the platform supports review submission. Hide buttons if unsupported.
