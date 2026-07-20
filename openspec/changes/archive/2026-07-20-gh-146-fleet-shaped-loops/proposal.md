# gh-146: Propose fleet-shaped loops adapted to the local project

## Problem

When a user adds a loop their other projects already have, the current proposal flow shows the agent's raw command with no awareness of existing patterns. The "Similar loops" section (from gh-144) lets the user manually use another loop as a starting point, but it's a separate opt-in step — the proposal itself is not pre-shaped.

## Proposal

Extend the loop proposal flow so that when creation intent matches a cached `LoopShape` from another instance, the proposal is **pre-shaped** with the chain structure from the matched loop, but with platform-specific parts adapted to the current project's detected platform (e.g., `az` where the cached loop uses `gh`).

**Key mechanics:**
1. **Shape matching at proposal time:** When the agent proposes a new loop (via MCP tool output containing `loop-proposal`), the renderer matches the intent against cached `LoopShape` entries from other instances. A match is detected by normalized command similarity (same base command) and returns the best `LoopShape`.
2. **Platform adaptation:** The matched shape's command/args and chain-step commands are adapted using the project's detected platform (via `infra:getPlatform`). Known substitutions are applied (e.g., `gh` → `az`, GitHub API URLs → Azure DevOps API URLs). Unknown or ambiguous parts are left unchanged and flagged.
3. **Provenance statement:** The proposal card shows a provenance badge like "Based on your implement-issue loop on prod-vm, adapted for Azure DevOps" so the user understands the origin and adaptation.
4. **Standard approve-before-create applies:** The pre-shaped proposal still goes through the normal approve/reject flow. The user can edit command, interval, and max-runs before approving.

**What changes:**
- The `LoopProposalRow` type gains optional fields: `provenance` (string) and `adaptedFrom` (shape metadata).
- The `LoopProposalCard` component renders a provenance badge when present.
- A new pure function `adaptShapeForPlatform(shape, targetPlatform)` performs the command substitution.
- A new pure function `matchShapeToFleetIntent(command, shapes)` finds the best matching cached shape.
- The proposal insertion logic in `SessionChatView` computes shape matches and adapts the proposal before showing the card.
- i18n keys for the provenance badge and adaptation labels.
- Mock data and tests for the matching and adaptation functions.

**What doesn't change:**
- The approve/reject flow remains identical.
- No new nav, no new page, no dashboard.
- Chain steps are pre-populated in the proposal but not displayed as a chain preview (that's the chain-edit-proposal card's job). The proposal shows the adapted command string.
- The "Similar loops" section still appears below, offering additional starting points.
