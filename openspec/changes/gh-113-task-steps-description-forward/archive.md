# gh-113 Archive

## Change: Task steps — description forward, raw command behind a fold

**GitHub Issue**: #113
**Branch**: `gh-113-task-steps-description-forward`
**Status**: implemented

### Summary

Made each chain step in the loop card's task chain expansion description-forward: the task's human-readable name/description is the prominent primary label, and the raw CLI command lives behind a per-step disclosure (collapsed by default). Long commands truncate gracefully when disclosed (clamped to 4 lines via `-webkit-line-clamp`).

### Files changed

| File | Change |
|------|--------|
| `src/renderer/src/components/TaskChainView.tsx` | Restructured `TaskChainStep` for description-forward layout; added `COMMAND_MAX_LINES` constant, `aria-expanded` on toggle, `--cmd-max-lines` CSS variable; removed unused `hasBranches` prop |
| `src/renderer/src/theme.css` | Updated `.task-chain-step-content` (flex-wrap), `.task-chain-step-name` (max-width), `.task-chain-step-toggle-cmd` (border, compact size, active accent), `.task-chain-step-command` (line-clamp truncation) |
| `openspec/changes/gh-113-task-steps-description-forward/proposal.md` | Added |
| `openspec/changes/gh-113-task-steps-description-forward/tasks.md` | Added |
| `openspec/changes/gh-113-task-steps-description-forward/archive.md` | Added |

### Verification

- `pnpm typecheck` — no new errors in touched files (pre-existing errors in `src/main/` are unchanged)
- Web-only typecheck (`tsc --noEmit -p tsconfig.web.json`) — 0 errors in `TaskChainView.tsx`
- Mock adapter works unchanged (all mock tasks have descriptive names; fallback logic intact)
