# Archive: Bulk relabel as a sentence

## Change ID

gh-142-bulk-relabel

## Status

Completed

## Summary

Added a `bulk-relabel` infra action and natural-language intent detection that lets users apply a label to multiple issues with one compact confirmation sentence like "mark these as to-refine". The confirmation names every affected issue; partial failures are reported per-item.

## What Changed

### Files Modified

- `src/shared/ipc.ts` — Added `bulk-relabel` to `InfraAction` union; added `BulkRelabelParams`, `BulkRelabelItemResult`, `BulkRelabelResult` types.
- `src/main/ipc-validation.ts` — Added `"bulk-relabel"` to `INFRA_ACTIONS` array; added param validation for `issueNumbers`, `addLabels`, `removeLabels`.
- `src/main/index.ts` — Added `case "bulk-relabel"` handler that iterates issue numbers sequentially, calling `gh issue edit` per issue and collecting per-item success/failure results.
- `src/renderer/src/components/InfraChatPanel.tsx` — Added `lastIssueListRef` to track last-listed issues; added intent detection for "mark these as X" / "relabel these as X" / "add label X to these" patterns; added confirmation card with per-issue listing; added answer handler for bulk relabel with per-item result rendering (✓/✗); added `pendingBulkRelabels` state.
- `src/renderer/src/i18n/en.json` — Added `bulkRelabel` key group (preview, applyQuestion, optionApply, optionCancel, allApplied, partiallyApplied, applyFailed, noLabelSpecified, noIssuesInContext, issueNumbersRequired, noLabels); updated `infra.helpText` to mention bulk relabel.

### Behavioral Changes

| Before | After |
|--------|-------|
| Labels added one issue at a time via "edit issue #N add label X" | "mark these as to-refine" applies a label to all issues from the last list in one confirmation |
| No way to refer to "these" issues from a prior query | `lastIssueListRef` stores the most recent issue list; "these/those/all" resolves to it |
| No per-item failure reporting | Bulk relabel returns per-item ✓/✗ results with error details for failures |
| Help text had no mention of bulk relabel | Help text now includes "mark these as X: bulk-add a label to all issues from the last list" |

### No New

- No new IPC channels — uses existing `infra:executeAction` with the new `bulk-relabel` action
- No new UI components — confirmation uses existing `QuestionPanel`
- No new services or interfaces
- No changes to mock adapter — action is proxied via IPC; `pnpm dev:web` continues to work
- No changes to theme or visual language

## Verification

- `pnpm typecheck` passes (no new errors introduced)
- Existing IPC validation tests pass (41/43, 2 pre-existing failures unrelated to this change)
- All new i18n keys referenced in code exist in en.json
