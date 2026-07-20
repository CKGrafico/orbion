# gh-113 Tasks

## Task 1: Restructure TaskChainStep to be description-forward

- **Status**: done
- **Tier**: 1
- **Touches**: `src/renderer/src/components/TaskChainView.tsx`
- **Agent**: default

### Description

Rewrite `TaskChainStep` so the task name (`step.task.name`) is the prominent primary label. The full CLI command is behind a per-step disclosure toggle, collapsed by default. When the task has no name, the command becomes the display name (fallback) but the disclosure toggle is still available.

Add `COMMAND_MAX_LINES = 4` constant and pass it as `--cmd-max-lines` CSS custom property for the disclosed command block. Add `aria-expanded` attribute to the toggle button for accessibility.

Remove the unused `hasBranches` prop from `TaskChainStepProps` (was a pre-existing TS6133 warning).

## Task 2: Update CSS for description-forward step layout

- **Status**: done
- **Tier**: 1
- **Touches**: `src/renderer/src/theme.css`
- **Agent**: default

### Description

Update task chain CSS classes:

- `.task-chain-step-content`: add `flex-wrap: wrap` so the name and toggle don't overflow on narrow cards; reduce gap from 8px to 6px.
- `.task-chain-step-name`: add `max-width: 100%` so the name can use full available width.
- `.task-chain-step-toggle-cmd`: add a subtle border (`1px solid var(--border-subtle)`), reduce font-size to 9px, add compact padding; add `[aria-expanded="true"]` accent highlight using `var(--accent-task)`.
- `.task-chain-step-command`: add `-webkit-line-clamp` using `var(--cmd-max-lines, 4)` for graceful truncation of long commands, with `display: -webkit-box` + `-webkit-box-orient: vertical` and a matching `max-height`.
