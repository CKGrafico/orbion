# Archive: Edit a task chain by talking; the card re-renders

## Change ID

gh-115-chain-edit-by-chat

## Status

Applied

## Summary

Implemented chat-driven chain editing for loop task chains. When the agent uses MCP tools to create or update tasks, Orbion intercepts the tool-call output, parses the proposal payload, and renders a `ChainEditProposalCard` in the chat stream. The card shows the proposed chain as a preview (via `TaskChainView`), operation summaries, and Approve/Reject buttons. On approval, the MCP service applies the edit and the loop card's chain cache is invalidated so it re-fetches fresh data on next expansion. No form-based chain editor is introduced.

## What changed

### New files

- `src/renderer/src/components/ChainEditProposalCard.tsx` — proposal card component for chain edits
- `openspec/changes/gh-115-chain-edit-by-chat/` — OpenSpec change artifacts

### Modified files

- `src/renderer/src/chat/types.ts` — added `chain-edit-proposal` row kind, `ChainEditProposalRow`, `ChainEditProposalStatus`, `ChainEditOperationSummary`
- `src/renderer/src/chat/useTranscript.ts` — added `insertChainEditProposal`, `updateChainEditProposalStatus`, parsing for `chain-edit-proposal-` messages
- `src/renderer/src/components/LoopCard.tsx` — added `chainVersion` prop for cache invalidation on chain edit apply
- `src/renderer/src/components/SessionChatView.tsx` — wired `ChainEditProposalCard` rendering, MCP tool-call interception, apply via MCP service
- `src/renderer/src/i18n/en.json` — i18n keys for chain edit proposal
- `src/renderer/src/theme.css` — CSS styles for chain edit proposal card
- `src/renderer/src/services/mock/MockServices.ts` — mock MCP tools for create_task, update_task, apply_chain_edit

## Acceptance criteria

- [x] The agent translates the request into task create/update operations via MCP, shows the resulting chain as a proposal, and applies on approval.
- [x] The expanded card re-renders the new chain after apply (chain cache invalidation + re-fetch).
- [x] No form-based chain editor is introduced.
