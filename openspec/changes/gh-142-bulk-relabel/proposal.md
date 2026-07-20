# Proposal: Bulk relabel as a sentence

## Change ID

gh-142-bulk-relabel

## Summary

Users triaging issues want compact, sentence-level commands like "mark these six as to-refine" to apply a label to multiple issues at once. Today, labels must be added one issue at a time via the edit-issue flow. This change adds a `bulk-relabel` infra action and natural-language intent detection in the InfraChatPanel so that a user can relabel the entire current issue stack with one confirmation.

## Problem

- Adding a label to multiple issues requires repeated "edit issue #N add label X" commands.
- The issue explicitly asks: "The agent resolves the referenced set (from a prior stack or explicit filter), shows the list + intended change, and applies to all on one approval."
- Partial failures must be reported per-item, not as a single error.

## Solution

### Approach

1. **New `bulk-relabel` IPC action** in `shared/ipc.ts` with typed params (`issueNumbers`, `addLabels`, `removeLabels`, `repo`) and a typed result (`BulkRelabelResult` with per-item `BulkRelabelItemResult[]`).
2. **Main process handler** that iterates the issue numbers sequentially, calling `gh issue edit #N --add-label X` for each, collecting per-item success/failure.
3. **IPC validation** for the new action at the IPC boundary.
4. **InfraChatPanel intent detection** for natural-language patterns like "mark these as to-refine", "relabel these as bug", "add label X to these", "mark all as Y".
5. **Issue list tracking** — `lastIssueListRef` stores the last issue list from `list-issues`, so "these / those / all" resolves to the current stack.
6. **Confirmation card** — shows every affected issue by number + title and the intended label change; a single approval applies to all; partial failures are reported per-item.
7. **i18n strings** for all user-facing text.

### Scope

- **Files changed**: `src/shared/ipc.ts`, `src/main/index.ts`, `src/main/ipc-validation.ts`, `src/renderer/src/components/InfraChatPanel.tsx`, `src/renderer/src/i18n/en.json`
- **No new IPC channels**: Uses existing `infra:executeAction` channel with the new `bulk-relabel` action.
- **No new UI components**: The confirmation uses the existing `QuestionPanel` component.
- **Mock adapter**: No mock changes needed — `bulk-relabel` calls `infra:executeAction` which is proxied via IPC (no renderer-side fetch).

## Acceptance Criteria

- [ ] The `bulk-relabel` infra action accepts `issueNumbers`, `addLabels`, `removeLabels`, and `repo`
- [ ] The action applies label changes sequentially to each issue, collecting per-item success/failure
- [ ] The confirmation card names every affected issue by number + title
- [ ] Partial failures are reported per-item (✓ / ✗ per issue with error message)
- [ ] Sentence patterns detected: "mark these as X", "relabel these as X", "add label X to these", "mark all as X"
- [ ] "these/those/all" resolves from the last-listed issue stack
- [ ] Clear error when no issues are in context
- [ ] Clear error when no label is specified
- [ ] `pnpm typecheck` passes (no new errors)
- [ ] Mock adapter continues to work
