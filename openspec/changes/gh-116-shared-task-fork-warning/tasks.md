# Tasks: Warn when editing a task shared by multiple loops

## Change ID

gh-116-shared-task-fork-warning

## Tasks

### Task 1: Add SharedTaskWarning type and extend ChainEditProposalRow

- **Tier:** 1 (core types)
- **Touches:** `src/renderer/src/chat/types.ts`
- **Description:** Add `SharedTaskWarning` interface with `taskIds: string[]`, `referencingLoops: Array<{ loopId: string; loopName: string }>`, and `decision: null | "change-all" | "fork-copy"`. Extend `ChainEditProposalRow` with an optional `sharedTaskWarning?: SharedTaskWarning` field.
- **Verification:** `pnpm typecheck` passes.

### Task 2: Shared-task detection in insertChainEditProposal

- **Tier:** 1
- **Touches:** `src/renderer/src/chat/useTranscript.ts`
- **Depends on:** Task 1
- **Description:** When inserting a chain-edit-proposal, check whether the proposed `update-task` operations target tasks that are referenced by loops other than the one being edited. Fetch task references from `GET /api/loops` data (available via the loop store). If shared references are found, populate `sharedTaskWarning` on the row. Also add `updateChainEditProposalForkDecision` hook to set the `decision` field.
- **Verification:** `pnpm typecheck` passes.

### Task 3: Shared-task warning UI in ChainEditProposalCard

- **Tier:** 1
- **Touches:** `src/renderer/src/components/ChainEditProposalCard.tsx`
- **Depends on:** Task 2
- **Description:** When `sharedTaskWarning` is set and `decision` is null, show a warning section listing the other loops that will be affected. Show "Change for all" and "Fork a copy for this loop" buttons. On selection, set the `decision` field. When a decision is already made, show it as a badge and proceed with normal approve/reject flow. The approve button label changes to reflect the strategy.
- **Verification:** Component renders warning correctly; fork decision flows through.

### Task 4: Wire fork strategy into SessionChatView apply flow

- **Tier:** 1
- **Touches:** `src/renderer/src/components/SessionChatView.tsx`
- **Depends on:** Task 3
- **Description:** Pass per-env loops data needed for shared-task detection. When calling MCP `apply_chain_edit`, include `forkStrategy: "change-all" | "fork-copy"` based on the proposal's `sharedTaskWarning.decision`. The handler extracts the fork decision from the row data.
- **Verification:** Fork strategy is sent to MCP on apply; chain re-renders correctly.

### Task 5: i18n, CSS, mock adapter

- **Tier:** 2
- **Touches:** `src/renderer/src/i18n/en.json`, `src/renderer/src/theme.css`, `src/renderer/src/services/mock/MockServices.ts`
- **Depends on:** Task 4
- **Description:** Add i18n keys for shared-task warning (warning title, referencing loops label, change-for-all button, fork-copy button, strategy badge). Add CSS for warning section matching existing design language. Enrich mock with a shared-task scenario where `task-3` ("Notify failure") is referenced by both `loop-1` (via task-1 chain) and `loop-6` (via task-6 chain), so chain-edit proposals on either loop trigger the warning.
- **Verification:** `pnpm typecheck` passes. Mock mode shows shared-task warning in chain edit proposal.
