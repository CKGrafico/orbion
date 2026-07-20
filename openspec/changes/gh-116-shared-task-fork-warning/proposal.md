# Proposal: Warn when editing a task shared by multiple loops

## Change ID

gh-116-shared-task-fork-warning

## Summary

When a chain-edit proposal modifies a task that other loops also reference, the proposal card warns the user and offers a choice: "Change for all" (mutate the shared task in place, affecting all referencing loops) or "Fork a copy for this loop" (create a new task with the proposed changes and re-point only the current loop's chain, leaving other loops untouched).

## Problem

- A `TaskDefinition` can be shared across multiple loops (multiple `LoopMeta.taskId` values can point to the same task, and tasks chain to other tasks via `onSuccessTaskId`/`onFailureTaskId`).
- When the agent proposes a chain edit that modifies a shared task, the user has no way to know that the change will affect other loops, and no way to fork instead.
- Acceptance criteria from the issue: before applying, the agent checks whether the task is referenced elsewhere; if so, the proposal names those loops and offers "change for all" vs "fork a copy for this loop". Forking creates a new task and re-points only the current loop's chain.

## Solution

### Approach

1. **Shared-task detection** — When a `chain-edit-proposal` is intercepted from MCP tool output, before inserting it into the transcript as `pending`, the renderer checks whether the task being modified (`update-task` operations) is referenced by any loops other than the one being edited. This is done by fetching `GET /api/loops` (already available in the loop store) and comparing `taskId` references across all loops. If the task appears in chains of other loops (via `onSuccessTaskId`/`onFailureTaskId` traversal), those loop names are collected.

2. **ChainEditProposalRow extension** — Add a `sharedTaskWarning` field to `ChainEditProposalRow`. When present, it contains:
   - `taskIds`: the IDs of shared tasks being modified
   - `referencingLoops`: array of `{ loopId, loopName }` for loops besides the current one that reference the shared task(s)
   - `decision`: `null` (pending) | `"change-all"` | `"fork-copy"`

3. **ChainEditProposalCard UI** — When `sharedTaskWarning` is set and `decision` is `null`, the card shows a warning section above the approve/reject buttons listing the other loops that will be affected, and two action buttons: "Change for all" and "Fork a copy". Selecting either sets the `decision` field and then shows the normal Approve/Reject buttons (with the chosen strategy noted in the approve button label).

4. **Fork logic** — When the user chooses "Fork a copy for this loop":
   - On approval, the MCP `apply_chain_edit` call includes a `forkStrategy: "fork-copy"` flag along with the `proposalId` and `loopId`.
   - The MCP tool (or the daemon) creates a copy of the shared task with the proposed changes, gives it a new ID, and re-points only the current loop's chain to the new task. Other loops continue referencing the original task.
   - If the user chooses "Change for all", the normal `apply_chain_edit` proceeds (the shared task is mutated in place, and all referencing loops see the change).

5. **Mock adapter** — Enriched mock to simulate a shared-task scenario where a task is referenced by multiple loops, so the warning UI can be tested in browser dev mode.

### Key design decisions

- **Detection is renderer-side** (not MCP/daemon-side). The renderer already has access to all loops via the polling store and to all tasks via `GET /api/tasks`. Checking task references is a pure data operation that doesn't require new API endpoints.
- **Fork strategy is communicated to MCP at apply time.** The MCP `apply_chain_edit` tool receives a `forkStrategy` parameter. This keeps the forking logic on the daemon side where it has transactional access to the task and loop data.
- **Warning shows before approve/reject.** The user must decide on the fork strategy before they can approve, ensuring they're always informed when a shared task is about to be modified.
- **Only `update-task` operations trigger the warning.** `create-task` and `delete-task` operations don't modify existing shared tasks (create makes a new one; delete would need its own warning but is out of scope for this issue).

### Modified files

- `src/renderer/src/chat/types.ts` — add `SharedTaskWarning` interface, extend `ChainEditProposalRow` with `sharedTaskWarning` field
- `src/renderer/src/chat/useTranscript.ts` — shared-task detection in `insertChainEditProposal`, propagate `sharedTaskWarning` + `decision` in `updateChainEditProposalStatus`
- `src/renderer/src/components/ChainEditProposalCard.tsx` — warning UI with fork-strategy choice
- `src/renderer/src/components/SessionChatView.tsx` — pass `perEnvLoops` for shared-task detection; pass `forkStrategy` in MCP apply call
- `src/renderer/src/services/mock/MockServices.ts` — mock data with shared-task scenario
- `src/renderer/src/i18n/en.json` — i18n keys for shared-task warning
- `src/renderer/src/theme.css` — CSS styles for warning section in chain edit proposal

## Acceptance criteria

- [ ] Before applying a chain-edit proposal that modifies a shared task, the proposal card names the other loops referencing that task.
- [ ] The user can choose "Change for all" (mutate in place) or "Fork a copy for this loop" (create a new task, re-point only the current loop).
- [ ] Forking creates a new task and re-points only the current loop's chain; other loops are unaffected.
- [ ] The mock adapter includes a shared-task scenario for browser dev testing.
