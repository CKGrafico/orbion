# Proposal: Offer structural chain improvements to sibling loops

## Change ID

gh-147-sibling-structural-offers

## Summary

After a structural chain edit is applied, the agent identifies sibling loops on other instances that share the same cached shape (structural pattern) and offers the same structural change to each sibling. Each offer requires its own explicit approval. Changes that only affect slot values (command arguments, prompt wording, platform-specific tokens) never trigger sibling offers. If a user declines an offer, that decision is remembered so the same offer is not repeated.

## Problem

- Users who improve a loop chain's structure (e.g., adding a lint step after build, inserting a failure notification handler) often have the same structural need on other instances that run similar loops.
- Currently, applying the same structural change to sibling loops requires repeating the entire chat request for each instance, which is tedious and error-prone.
- There is no mechanism to propagate structural improvements across the fleet while respecting per-instance differences (slot values like `gh` vs `az` must never be silently overwritten).

## Solution

### Approach

1. **Structural change detection** — After a `ChainEditProposalCard` is approved and the status transitions to `"applied"`, a new function (`detectStructuralChanges`) analyzes the applied edit's operation summaries to determine whether the change was **structural** (adding/removing/reordering steps, changing chain topology) versus a **slot-value change** (updating command text, arguments, or prompt wording). Only structural changes trigger sibling offers.

2. **Sibling loop discovery** — Using the existing `LoopShapeCacheService`, after a structural change is applied, the system finds all loops across reachable instances whose cached `LoopShape` matches the edited loop's shape (same chain topology: same step count, same branch structure, same step-names pattern). These are "siblings" — structurally identical loops that may differ in slot values.

3. **Structural diff computation** — A pure function (`computeStructuralDiff`) compares the original chain shape to the post-edit chain shape and produces a structural diff: which steps were added, removed, or reordered, ignoring the specific command strings. This diff is what gets offered to siblings.

4. **SiblingOfferRow** — A new transcript row type (`sibling-offer`) that presents one offer card per sibling loop. Each card shows: the sibling loop's name/instance, a summary of the structural change ("Add step after Build"), an Approve/Decline button pair, and the sibling's instance name. Cards are inserted after the applied chain-edit-proposal row so they appear in context.

5. **Per-instance approval** — Each sibling offer card acts independently. Approving one does not affect others. On approval, the structural diff is applied to the sibling loop via `McpService.callTool` (with a new `apply_structural_diff` tool that the MCP server on the daemon handles). Slot values on the sibling are preserved; only the structural operations (add/remove/reorder steps) are applied.

6. **Decline memory** — When a user declines a sibling offer, the (environmentId, loopId, structuralChangeFingerprint) triple is stored in the main-process config store. Before presenting a sibling offer, the system checks this decline list and skips any previously declined combination. The fingerprint is a hash of the structural diff, so different structural changes to the same loop will trigger new offers.

7. **Slot-value exclusion** — The `detectStructuralChanges` function returns `null` for edits that only modify slot values (command text, arguments, descriptions). Specifically, `update-task` operations that change only the `command` or `commandArgs` fields (not the chain topology) are classified as slot-value changes. Only `create-task` and `delete-task` operations, and `update-task` operations that modify `onSuccessTaskId` or `onFailureTaskId` (chain topology), are considered structural.

### Key design decisions

- **Structural vs slot-value distinction is critical.** The issue explicitly states that "changes to platform commands or prompt wording (slot values) never trigger offers." We implement this by classifying each operation: topology changes = structural; command/arg text changes = slot-value. Only structural changes propagate.
- **One card per sibling, not one card for all siblings.** The issue says "each application requires its own approval," so each sibling gets its own offer card in the chat stream rather than a bulk-apply card.
- **Shape matching uses the LoopShapeCache, not fleet-similarity scoring.** Sibling detection requires exact structural match (same shape), not fuzzy similarity. The `LoopShape.chainSteps` and `LoopShape.taskId` fields encode the structural topology.
- **Decline memory is persistent.** Stored in the config store (main process) so it survives app restarts and session changes. This respects the user's decision across sessions.
- **No new surfaces.** All offer cards appear in the existing chat stream as transcript rows, following the "chat is the verb" principle. No sidebar entries, no dedicated patterns screen, no fleet dashboard.

### New files

- `src/renderer/src/fleet-structural-diff.ts` — Pure functions: structural change detection, sibling discovery via shape matching, structural diff computation, decline-store interaction
- `src/renderer/src/components/SiblingOfferCard.tsx` — Offer card component rendered in the chat stream, one per sibling loop
- `src/main/sibling-decline-store.ts` — Persistent decline memory (stored in electron-store, main process only)
- `src/shared/sibling-offer-types.ts` — Shared types for the sibling offer IPC channel

### Modified files

- `src/renderer/src/chat/types.ts` — Add `SiblingOfferRow` type and `sibling-offer` row kind
- `src/renderer/src/chat/useTranscript.ts` — Add `insertSiblingOffer` / `updateSiblingOfferStatus` hooks
- `src/renderer/src/components/SessionChatView.tsx` — Render `SiblingOfferCard` rows; trigger sibling discovery on chain-edit apply; wire approval/decline callbacks
- `src/renderer/src/components/ChainEditProposalCard.tsx` — Parent passes `onApplied` callback with structural context
- `src/shared/ipc.ts` — Add `SiblingOfferBridge` and decline-store IPC channels
- `src/preload/index.ts` — Expose `SiblingOfferBridge` via contextBridge
- `src/main/index.ts` — Register `siblingDecline:*` IPC handlers
- `src/renderer/src/i18n/en.json` — i18n keys for sibling offer
- `src/renderer/src/theme.css` — CSS styles for sibling offer card
- `src/renderer/src/services/interfaces.ts` — Add `ISiblingOfferService` interface
- `src/renderer/src/services/impl/SiblingOfferService.ts` — Service implementation
- `src/renderer/src/services/container.ts` — Register `ISiblingOfferService`
- `src/renderer/src/services/mock/MockServices.ts` — Mock implementation

## Acceptance criteria

- [ ] After a structural chain edit, the agent identifies sibling loops (same cached shape) and offers the change per sibling; each application requires its own approval
- [ ] Changes to platform commands or prompt wording (slot values) never trigger offers
- [ ] Declines are remembered; the same structural offer for the same sibling is not shown again
