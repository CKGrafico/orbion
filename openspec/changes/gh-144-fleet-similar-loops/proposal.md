# Query the fleet for similar loops at creation time

## Change ID
gh-144-fleet-similar-loops

## GitHub Issue
#144

## Summary
When the agent proposes a new loop via MCP `create_loop`, Orbion queries loops from other reachable instances, scores them for similarity against the proposed command/interval/project, and surfaces matching loops in the LoopProposalCard. The user can see what they already run elsewhere and optionally pre-fill the proposal from an existing loop. No local storage required.

## Motivation
Loops are ~90% similar across instances with intentional per-project differences (the "template with slots" pattern from the design model). Without fleet awareness, users re-create loops from scratch on each instance when they could start from what they already run. This is the core "Patterns are invisible fleet-awareness" principle from the product spec.

## Approach

### Similarity scoring (pure renderer function)
A new pure function `scoreLoopSimilarity(proposal, candidate)` computes a numeric score (0-1) comparing:
- **Command similarity** (primary): normalized base command match (strips path prefix, extensions)
- **Interval proximity**: same interval = high, comparable = partial
- **Project scope**: same project name across instances = boost
- **Description overlap**: if both have descriptions, token overlap

The function is pure, testable, and runs on-demand. No persistent state.

### Data source
The fleet-wide loop data is already available in the renderer:
- `perEnvLoops` (polled every 5s per instance, already in `SessionChatView` props)
- `computeFleetRollup()` from `fleet-rollup.ts` produces `LoopWithOrigin[]`
- The `environments` and `reachability` state

No new IPC channel is needed. The data is already present; we just need to compute similarity when a proposal appears.

### LoopProposalCard changes
Add an optional `similarLoops` prop (`SimilarLoopMatch[]`). When present and non-empty, the card renders a collapsible "Similar loops" section showing:
- Instance name + project name attribution
- Command (truncated, same expand pattern)
- Interval
- A "Use as starting point" button that pre-fills the proposal's command/interval fields

### Transient computation (no storage)
Similarity is computed when the `LoopProposalCard` mounts. The computation is:
1. Gather all loops from reachable instances (excluding the proposal's own instance)
2. Score each candidate against the proposal
3. Return the top N (3) matches above a threshold (0.5)

No results are persisted. If the proposal is re-rendered (e.g., after reload), similarity is recomputed from current data.

### Task definitions
Also check `GET /api/tasks` from reachable instances for task definitions whose command matches, since tasks are reusable templates. However, the primary matching is on loops since they carry runtime context.

## Acceptance Criteria Mapping
- "During creation, the agent fetches loops/tasks from other reachable instances and identifies similar ones" -> Covered by the similarity computation using existing polled fleet data
- "Matches inform the proposal" -> Covered by the "Similar loops" section in LoopProposalCard with "Use as starting point" action
- "No local storage required in this issue" -> Covered: similarity is transient, computed on mount

## Design Model Alignment
This implements the **Patterns are invisible fleet-awareness** principle:
> "At create time the agent may propose a loop pre-shaped like the user's others and adapted to this project's platform"

This is the first half: *showing* similar loops. The second half (agent automatically pre-shaping) is future work.

## Files Modified
- `src/renderer/src/fleet-similarity.ts` (NEW) - Pure similarity scoring functions
- `src/renderer/src/chat/types.ts` - Add `SimilarLoopMatch` type, extend `LoopProposalRow`
- `src/renderer/src/components/LoopProposalCard.tsx` - Add similar loops section with "Use as starting point"
- `src/renderer/src/components/SessionChatView.tsx` - Compute and pass similar loops to LoopProposalCard
- `src/renderer/src/theme.css` - Styles for similar loops section
- `src/renderer/src/i18n/en.json` - i18n keys for similar loops UI
- `tests/fleet-similarity.test.ts` (NEW) - Unit tests for similarity scoring
