# Cross-PR conflict and overlap detection in a batch

## Change ID
`gh-157-cross-pr-overlap-detection`

## Source
GitHub Issue #157

## Problem
When reviewing overnight PR batches, users have no way to know when PRs interfere — same files changed, or near-duplicate solutions. This leads to merge conflicts, duplicate work, and wasted review time.

## Proposal
Add cross-PR overlap detection to the review queue strip that:

1. **Detects overlapping changed-file sets** across all PRs in the batch and flags affected queue items with an overlap indicator (e.g. "overlaps #42 — review together").
2. **Flags likely duplicate/conflicting intents** with a short note (e.g. "Same security fix as #42" or "Both modify auth middleware").
3. **Offers a suggested review order** when overlaps exist — reviewing PRs that share files together, and high-risk overlapping PRs before low-risk independent ones.

## Design Decisions

### Data flow
- The overlap analysis runs in the **renderer** as a pure computation over the batch's PR diff data. The `get-pr-diff` infra action already fetches per-PR file lists; we reuse that data.
- When a batch is entered, the `ReviewModeService` fetches diffs for all PRs in the batch (if not already cached) and runs the overlap detection algorithm.
- Overlap results are stored as observable state on the service; the queue strip and briefing view read them reactively.

### Overlap detection algorithm
1. For each PR in the batch, get the set of changed file paths (from `GetPrDiffResult.files[].path`).
2. For each pair of PRs, compute file-set intersection.
3. Pairs with non-zero intersection are flagged as overlaps.
4. Overlap severity is classified:
   - **conflict**: Same files with opposing changes (additions in same path by both PRs).
   - **duplicate**: Near-identical file sets (Jaccard similarity > 0.6 between two PRs' file sets).
   - **touching**: Shared files but different scopes (general overlap).
5. A suggested review order sorts overlapping PRs first (highest overlap count), then by risk level (high → medium → low → uncertain).

### UI surfaces
1. **Queue strip row**: Each affected PR row gets an overlap indicator chip below the verdict line — e.g. "overlaps #42, #58 — review together". The chip uses the `warning` color (`--warning` / `#ffcc5c`).
2. **Review order banner**: When overlaps are detected, a compact banner appears at the top of the briefing view / main area suggesting a review order. The banner lists PRs in suggested order with overlap notes.
3. **Briefing view enrichment**: If the active PR overlaps with others, the flagged-files section notes which other PRs also touch the same file.

### Mock data
Mock infra service returns pre-built overlap scenarios (a batch of 4 PRs where 2 share files, and 1 is near-duplicate).

## Scope
- This change is **limited to the review mode overlay** — the queue strip, briefing view, and the ReviewModeService.
- No new IPC channels, no main-process changes, no new API endpoints.
- Reuses the existing `get-pr-diff` infra action for file-list data.
- The overlap analysis is a pure function in `src/shared/` or `src/renderer/src/features/review/`.

## Acceptance Criteria
- [ ] For a batch, overlapping changed-file sets are detected and flagged on affected queue items ("overlaps #42 — review together").
- [ ] The agent flags likely duplicate/conflicting intents with a short note; a suggested review order is offered when overlaps exist.
