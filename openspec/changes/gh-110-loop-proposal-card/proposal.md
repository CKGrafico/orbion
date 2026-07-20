# Change: Create a loop by describing it in chat, with a max-runs suggestion

## Issue
GitHub Issue #110

## Summary
When the agent (via MCP tools) proposes creating a loop — command, interval, project, options (run-immediately, max-runs) — it should appear as a proposal card in the chat stream. On approval, the loop is created in the home project + instance and its live card appears. On rejection, nothing is created. If the command invokes an agent runtime and no max-runs is set, the proposal includes a suggested cap the user can accept, change, or remove; non-agent loops are not nagged.

## Rationale
This is the primary "chat is the verb" interaction for loop creation. The user says something like "run the test suite every 30 minutes" and the agent proposes a structured, reviewable loop before anything is created. The max-runs nudge for agent commands prevents unbounded agent loops from running forever without the user's explicit choice.

## Design

### Loop Proposal Card
A new transcript row type `loop-proposal` renders as a card in the chat stream showing:
- **Command** (monospace, with disclosure fold for long commands)
- **Interval** (e.g., "30m", "1h")
- **Project** (name, from the session's home project)
- **Options**: run-immediately toggle, max-runs input (with suggestion badge if agent command detected)
- **Approve / Reject** buttons

### Agent Command Detection & Max-Runs Suggestion
When the proposed command matches known agent runtime patterns (e.g., `opencode`, `claude-code`, `claude`, `codex`), and no `max-runs` is set, the proposal card shows a suggested cap (e.g., "Suggested: 10 runs") as a clickable badge. The user can:
- Click the badge to accept the suggestion (fills the max-runs field)
- Edit the field to any number
- Clear the field to remove the cap

Non-agent commands (e.g., `npm test`, `docker compose up`) are not nagged about max-runs.

### Flow
1. Agent calls MCP `create_loop` tool with loop parameters
2. Instead of creating the loop directly, the agent's tool-call response is intercepted and rendered as a proposal card
3. User approves → Orbion calls `POST /api/loops` on the session's home instance to create the loop, then inserts a live `LoopCard` row in the transcript
4. User rejects → nothing is created; a brief "rejected" message appears in-stream

### Data Model
- New `LoopProposalRow` in `chat/types.ts` with fields: `command`, `commandArgs`, `interval`, `projectId`, `projectName`, `runImmediately`, `maxRuns`, `suggestedMaxRuns`, `environmentId`
- New `loop-proposal` row kind added to `RowKind` union
- The proposal is persisted as a special transcript message (id starting with `loop-proposal-`) so it survives reloads

### API
- Uses existing `POST /api/loops` endpoint (already listed in loop-task's API surface)
- Uses existing `apiRequest` from `api.ts`
- No new IPC channels needed

### Mock
- Mock MCP `create_loop` tool call is intercepted in MockMcpService to return a proposal payload instead of creating immediately
- Mock `POST /api/loops` returns a successful creation with a mock loop ID
