# Archive: Query the fleet for similar loops at creation time

## Change ID
gh-144-fleet-similar-loops

## GitHub Issue
#144

## Status
Completed

## Summary
Implemented fleet-wide similarity matching for loop creation proposals. When the agent proposes a new loop via MCP `create_loop`, Orbion queries loops from other reachable instances, scores them for similarity against the proposed command/interval/project, and surfaces matching loops in the LoopProposalCard. The user can see what they already run elsewhere and optionally pre-fill the proposal from an existing loop.

## Files Changed
- `src/renderer/src/fleet-similarity.ts` (NEW) - Pure similarity scoring functions
- `src/renderer/src/chat/types.ts` - Added `SimilarLoopMatch` type, extended `LoopProposalRow`
- `src/renderer/src/components/LoopProposalCard.tsx` - Added similar loops section with "Use as starting point"
- `src/renderer/src/components/SessionChatView.tsx` - Compute and pass similar loops to LoopProposalCard
- `src/renderer/src/App.tsx` - Pass fleetReachability and perEnvProjects to SessionChatView
- `src/renderer/src/theme.css` - Styles for similar loops section
- `src/renderer/src/i18n/en.json` - i18n keys for similar loops UI
- `tests/fleet-similarity.test.ts` (NEW) - Unit tests for similarity scoring (21 tests)

## Acceptance Criteria
- ✅ During creation, the agent fetches loops from other reachable instances and identifies similar ones
- ✅ Similarity judged by weighted scoring: command (0.50), interval (0.20), project (0.15), description (0.15)
- ✅ Matches inform the proposal via "Use as starting point" action
- ✅ No local storage required (computed transiently)

## Tests
21 Vitest unit tests covering `normalizeCommand`, `scoreLoopSimilarity`, and `computeSimilarLoops` - all passing.
