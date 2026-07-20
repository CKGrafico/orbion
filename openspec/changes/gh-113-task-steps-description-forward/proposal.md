# gh-113: Task steps — description forward, raw command behind a fold

## Problem

Each chain step in the loop card's task chain expansion currently shows the task's name and a CLI command toggle at equal visual weight. The raw command string dominates the step row even before the user opens it, making chains of shell commands look noisy and intimidating.

## Proposal

Make each chain step **description-forward**: the task's human-readable name/description is the primary, prominent label, and the raw CLI command lives behind a per-step disclosure that is collapsed by default. Long commands truncate gracefully when disclosed (clamped to 4 visible lines).

### Acceptance criteria (from issue #113)

- Each step shows the task's name/description prominently; the full command is behind a per-step disclosure.
- Long commands truncate gracefully when disclosed.

## Scope

| Layer | Change |
|-------|--------|
| Renderer `TaskChainView.tsx` | Restructure step layout to be description-forward; add `COMMAND_MAX_LINES` constant; add `aria-expanded` to toggle; remove unused `hasBranches` prop |
| Renderer `theme.css` | Update `.task-chain-step-content` to wrap; add border + compact scale to `.task-chain-step-toggle-cmd`; add active state with `accent-task` color; add line-clamp truncation to `.task-chain-step-command` |

## What this does NOT change

- No changes to the `ChainStep` type or `resolveTaskChain` logic
- No changes to the `LoopCard` component (it already renders `TaskChainView` correctly)
- No changes to IPC/main process (purely renderer)
- No new i18n keys (reuses existing `taskChain.showCommand` / `taskChain.hideCommand`)
- No changes to the mock adapter (mock tasks already have descriptive names; fallback still works)
