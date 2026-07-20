# Tasks: Edit a task chain by talking; the card re-renders

## Change ID

gh-115-chain-edit-by-chat

## Tasks

### Task 1: Add ChainEditProposalRow type and transcript integration

- **Tier:** 1 (core types + transcript)
- **Touches:** `src/renderer/src/chat/types.ts`, `src/renderer/src/chat/useTranscript.ts`
- **Description:** Add `chain-edit-proposal` to `RowKind` union. Create `ChainEditProposalRow` interface with proposalId, loopId, environmentId, proposedSteps (ChainStep[] for preview), operationSummaries (string[]), status (pending/applying/applied/rejected/error), error. Add `insertChainEditProposal` and `updateChainEditProposalStatus` to useTranscript. Add `isChainEditProposalMessage` / `parseChainEditProposalMessage` for persistence (messages with id starting with `chain-edit-proposal-`).
- **Verification:** `pnpm typecheck` passes.

### Task 2: Create ChainEditProposalCard component

- **Tier:** 1
- **Touches:** `src/renderer/src/components/ChainEditProposalCard.tsx` (new)
- **Depends on:** Task 1
- **Description:** Build the card component. Shows proposed chain via `<TaskChainView>`, operation summaries as a bullet list, Approve/Reject buttons. On approve, calls the MCP bridge to apply task operations. On rejection, marks as rejected. Follow existing `LoopProposalCard` pattern for status lifecycle.
- **Verification:** Component renders without TypeScript errors.

### Task 3: Wire chain-edit-proposal into SessionChatView and LoopCard re-render

- **Tier:** 1
- **Touches:** `src/renderer/src/components/SessionChatView.tsx`, `src/renderer/src/components/LoopCard.tsx`
- **Depends on:** Task 2
- **Description:** Add `chain-edit-proposal` case to SessionChatView row renderer. Add `chainVersion` counter prop to LoopCard; incrementing it causes `chainTasks` state to be cleared and re-fetched. Wire `onChainEditApplied` callback from ChainEditProposalCard → SessionChatView → LoopCard's chainVersion. Detect MCP tool-call-output events that contain task mutations and auto-insert chain-edit-proposal rows.
- **Verification:** Chain edit proposals appear in chat; loop card re-renders chain after apply.

### Task 4: i18n, CSS, mock adapter

- **Tier:** 2
- **Touches:** `src/renderer/src/i18n/en.json`, `src/renderer/src/theme.css`, `src/renderer/src/services/mock/MockServices.ts`
- **Depends on:** Task 3
- **Description:** Add i18n keys for chain edit proposal (title, summaries, approve, reject, applying, applied, rejected, error). Add CSS matching existing visual language. Enrich mock with chain-edit proposal simulation.
- **Verification:** `pnpm typecheck` passes. Mock mode shows chain edit proposal card.
