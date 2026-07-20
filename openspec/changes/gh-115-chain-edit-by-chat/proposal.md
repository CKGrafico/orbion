# Proposal: Edit a task chain by talking; the card re-renders

## Change ID

gh-115-chain-edit-by-chat

## Summary

When a user asks the agent to modify a loop's task chain (e.g., "add a step that runs the tests after the build"), the agent uses MCP tools to perform task create/update operations. Orbion intercepts the MCP tool-call output, renders a chain-edit proposal card in the chat, and on approval applies the changes and re-renders the expanded loop card's task chain. No form-based chain editor is introduced.

## Problem

- Users can only view task chains (read-only) inside expanded loop cards; they cannot change them through the UI.
- The agent (via MCP) can create and update tasks, but there is no proposal/confirmation flow for chain edits — the user gets no preview before it happens.
- After a chain edit, the expanded task chain in the loop card does not refresh, showing stale data.

## Solution

### Approach

1. **ChainEditProposalRow** — A new transcript row type (`chain-edit-proposal`) that carries the proposed chain changes: the loop ID, the environment ID, a list of proposed task operations (create/update), and the resulting chain steps for preview. Status follows the same lifecycle as loop proposals: `pending` → `applying` → `applied` | `rejected` | `error`.

2. **ChainEditProposalCard** — A card component rendered in the chat stream when a `chain-edit-proposal` row is encountered. It shows:
   - The proposed chain as a `TaskChainView` preview (read-only, showing what the chain *will* look like after apply).
   - A diff-style summary: "Add step: Test after Build", "Remove on-failure handler from Build", etc.
   - Approve / Reject buttons.
   - On approval, calls the relevant MCP tools to apply the changes, then marks the proposal as `applied`.
   - On rejection, marks the proposal as `rejected`.

3. **MCP tool-call detection** — When the agent's streaming events include tool calls that match task-related MCP tools (discovered at runtime via `McpBridge.getStatus()`), the `SessionChatView` intercepts the tool-call-output event, parses the result, and if it indicates task mutations from a conversational request, inserts a `chain-edit-proposal` row into the transcript.

4. **Loop card re-render on apply** — When a chain-edit proposal is approved and applied, the `LoopCard` component's task cache (`chainTasks` state) is invalidated so the next expansion fetches fresh data from `GET /api/tasks`. The `onChainEditApplied` callback propagates this up through `SessionChatView`.

5. **Mock adapter** — Enriched mock to support chain-edit proposal simulation in browser-only dev mode.

### Key design decisions

- **No form editor.** The chain is edited exclusively through chat (agent MCP tools). The proposal card is a preview, not an editor.
- **Tool names discovered at runtime.** We never hard-code MCP tool names; we match tool-call events against the runtime-advertised tool list to detect task-related operations.
- **Proposal persists as a system message** (id starting with `chain-edit-proposal-`) for reload survival, following the same pattern as `loop-proposal-` and `loop-summon-` messages.
- **Re-render is cache-invalidation, not push.** After apply, the LoopCard's `chainTasks` state is cleared so the next expand fetches fresh data. This is consistent with the current polling model.

### New files

- `src/renderer/src/components/ChainEditProposalCard.tsx` — proposal card for chain edits

### Modified files

- `src/renderer/src/chat/types.ts` — add `ChainEditProposalRow` type + `chain-edit-proposal` row kind
- `src/renderer/src/chat/useTranscript.ts` — add `insertChainEditProposal` / `updateChainEditProposalStatus` hooks + message parsing
- `src/renderer/src/components/SessionChatView.tsx` — render `ChainEditProposalCard` rows; intercept MCP tool calls for chain edits; propagate apply feedback to LoopCard
- `src/renderer/src/components/LoopCard.tsx` — expose `chainVersion` prop for cache invalidation on chain edit apply
- `src/renderer/src/services/mock/MockServices.ts` — enriched mock for chain-edit proposals
- `src/renderer/src/i18n/en.json` — i18n keys for chain edit proposal
- `src/renderer/src/theme.css` — CSS styles for chain edit proposal card

## Acceptance criteria

- [ ] The agent translates the request into task create/update operations via MCP, shows the resulting chain as a proposal, and applies on approval.
- [ ] The expanded card re-renders the new chain after apply.
- [ ] No form-based chain editor is introduced.
