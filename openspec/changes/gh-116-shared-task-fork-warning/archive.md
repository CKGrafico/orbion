# Archive: Warn when editing a task shared by multiple loops

## Change ID

gh-116-shared-task-fork-warning

## Status

Completed

## Summary

Implemented a shared-task warning in the chain-edit proposal flow. When a user edits a task that other loops also reference, the proposal card now warns them and offers two choices: "Change for all" (mutate in place) or "Fork a copy for this loop" (create a new task, re-point only this loop's chain).

## Files changed

- `src/renderer/src/chat/types.ts` — Added `SharedTaskWarning` interface; extended `ChainEditProposalRow` with optional `sharedTaskWarning` field
- `src/renderer/src/chat/useTranscript.ts` — Added `updateChainEditProposalForkDecision` hook; persist/restore `sharedTaskWarning` in chain-edit-proposal messages
- `src/renderer/src/components/ChainEditProposalCard.tsx` — Added warning section with fork-strategy choice buttons and decision badge
- `src/renderer/src/components/SessionChatView.tsx` — Added `detectSharedTaskWarning` function; pass `onForkDecision` callback; include `forkStrategy` in MCP `apply_chain_edit` call
- `src/renderer/src/i18n/en.json` — i18n keys for shared-task warning UI
- `src/renderer/src/services/mock/MockServices.ts` — Mock shared-task scenario (loop-8 shares task-4 with loop-3b); `forkStrategy` support in `apply_chain_edit`
- `src/renderer/src/theme.css` — CSS for warning section matching existing design language

## Acceptance criteria met

- ✅ Before applying a chain-edit proposal that modifies a shared task, the proposal card names the other loops referencing that task
- ✅ The user can choose "Change for all" (mutate in place) or "Fork a copy for this loop" (create a new task, re-point only the current loop)
- ✅ Forking creates a new task and re-points only the current loop's chain; other loops are unaffected (fork strategy is passed to MCP tool which handles the actual creation)
- ✅ The mock adapter includes a shared-task scenario for browser dev testing

## Archived

2026-07-20
