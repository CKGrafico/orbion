# Agent risk verdict on each PR

## Issue

GitHub Issue #149 — As a user triaging PRs, I want a one-line agent verdict per PR so I know where to look before opening anything.

## Summary

Add a one-line risk verdict to each PR inbox item. The system fetches the PR diff via `gh pr diff`, analyzes it with a local heuristic engine (lines changed, files touched, risk patterns), and produces a verdict string + risk level. Verdicts are cached by `(repo, number, headSha)` and automatically invalidated when the PR head changes. The verdict is displayed inline on the PR inbox item row.

## Acceptance Criteria

1. For each PR inbox item, the system fetches the diff via the platform CLI (`gh pr diff`) and produces a one-line verdict + risk level.
2. The verdict is shown on the PR inbox item in both InboxPanel and InboxView.
3. Verdicts are cached in the renderer keyed by `(repo, number, headSha)` and re-fetched only when the PR head SHA changes.
4. Verdicts are grounded in the actual diff; the analysis engine states uncertainty rather than inventing findings (e.g., "Large diff, unable to fully assess risk" for very large changes).
5. The `headSha` field is added to `PrAwaitingReviewItem` (fetched from `gh pr list` JSON output) for cache invalidation.
6. A new infra action `get-pr-verdict` fetches the diff and runs the heuristic analysis in the main process.
7. Mock adapter provides sample verdicts for browser-only development.
8. i18n keys are added for all new UI strings.
9. `pnpm typecheck` passes.

## Design Decisions

- **Local heuristic analysis in the main process**: follows the architecture constraint that all HTTP/CLI runs in the main process. The analysis is a deterministic structural scan of the diff (not an LLM call), counting lines, classifying file types, and detecting risk patterns. This is consistent with the "no fabricated data" constraint: the engine reports what it can observe in the diff and explicitly states uncertainty for large or binary-heavy changes.
- **Risk levels**: `low`, `medium`, `high`, `uncertain`. These are derived from simple heuristics: total lines changed, ratio of additions to deletions, presence of risky file patterns (config files, auth-related paths, lock files), and binary file count.
- **Cache keyed by `(repo, number, headSha)`**: the `headSha` field is added to `PrAwaitingReviewItem` by extending the `gh pr list` JSON fields to include `headRefOid`. When the PR is updated with new commits, the head SHA changes and the verdict is re-fetched. This avoids unnecessary re-analysis.
- **Verdict fetching is lazy and batched**: when the PR list updates (via `PrPollingService`), any PRs without a cached verdict or with a changed `headSha` are enqueued for verdict fetching. Fetching is sequential with a small delay between requests to avoid rate-limiting the `gh` CLI.
- **No new nav pillar or page**: verdicts appear as an inline detail on the existing PR inbox items. This is consistent with the design model.

## Scope

This change does NOT implement:
- PR review mode (separate issue, #150)
- LLM-based verdict generation (future enhancement)
- Azure DevOps PR verdicts (only `gh` is supported)
- Cross-PR conflict/duplicate detection (future issue)
