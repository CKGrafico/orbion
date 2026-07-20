# Spec: Loop Proposal Card Component

## Transcript Row Type

### `loop-proposal` row

Fields:
- `id`: unique row ID
- `kind`: `"loop-proposal"`
- `turnId`: parent turn ID
- `proposalId`: unique proposal identifier for tracking state
- `command`: string — the shell command to run
- `commandArgs`: string[] — command arguments
- `interval`: string — interval syntax (e.g., "30s", "5m", "1h", "1d", "1w")
- `projectId`: string — the target project ID
- `projectName`: string — the target project display name
- `runImmediately`: boolean — whether to trigger the first run right away
- `maxRuns`: number | null — cap on number of runs (null = unlimited)
- `suggestedMaxRuns`: number | null — the suggested cap (only set for agent commands)
- `environmentId`: string — which environment to create the loop on
- `status`: "pending" | "approved" | "rejected" | "creating" | "created" | "error"
- `createdLoopId`: string | null — populated after successful creation
- `error`: string | null — populated on creation error

## Agent Command Detection

A command is considered an "agent command" if the base command (first token) matches any of:
- `opencode`
- `claude-code`
- `claude`
- `codex`

When an agent command is detected and `maxRuns` is null, `suggestedMaxRuns` is set to 10 (a reasonable cap that can be changed).

## Visual Design

The proposal card follows the existing card styling (bg_elevated, rounded-md, hairline border):
- **Header**: "Loop proposal" label with a small icon
- **Command block**: monospace on bg_log surface, with disclosure for long commands
- **Meta row**: interval, project name
- **Options row**: "Run immediately" toggle, "Max runs" input with suggestion badge
- **Action buttons**: Approve (accent color), Reject (muted)

On approval:
- Buttons disappear, a "Creating..." state appears briefly
- On success, the proposal card collapses to a one-line "Loop created" message, and a live `LoopCard` row is inserted below it
- On error, the error is shown inline and the user can retry

On rejection:
- Buttons disappear, a "Rejected" label appears
- Card stays visible but collapsed
