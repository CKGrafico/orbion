# Tasks: Bulk relabel as a sentence

## Task 1: Add `bulk-relabel` types and IPC extensibility

**Tier**: 1  
**Touches**: `src/shared/ipc.ts`  
**Depends on**: —

### What

Add `bulk-relabel` to the `InfraAction` union type. Add `BulkRelabelParams`, `BulkRelabelItemResult`, and `BulkRelabelResult` interfaces after `EditIssueResult`.

### Verification

- `pnpm typecheck` — no new errors from shared/ipc.ts

---

## Task 2: Add IPC validation for `bulk-relabel`

**Tier**: 1  
**Touches**: `src/main/ipc-validation.ts`  
**Depends on**: Task 1

### What

1. Add `"bulk-relabel"` to the `INFRA_ACTIONS` array.
2. Add param validation: `issueNumbers` must be an array of numbers, `addLabels` must be an array of strings, `removeLabels` if provided must be an array.

### Verification

- Existing IPC validation tests continue to pass
- `validateIpc("infra:executeAction", [{ action: "bulk-relabel", params: { issueNumbers: [1, 2], addLabels: ["bug"] } }])` does not throw

---

## Task 3: Implement main process `bulk-relabel` handler

**Tier**: 1  
**Touches**: `src/main/index.ts`  
**Depends on**: Task 2

### What

Add a `case "bulk-relabel"` to the `infra:executeAction` switch that:

1. Validates params (issueNumbers + labels required).
2. Resolves the platform CLI (`gh` required for labels).
3. Sanitizes label inputs via `validateCliInputs`.
4. Iterates each issue number, calling `gh issue edit #N --add-label X [--remove-label Y] [--repo R]` sequentially.
5. Collects per-item results (`BulkRelabelItemResult[]`) with `ok` / `error` per item.
6. Returns `BulkRelabelResult` with `items`, `succeeded`, `failed` counts.

### Verification

- `pnpm typecheck` passes

---

## Task 4: Add InfraChatPanel intent detection and confirmation flow

**Tier**: 2  
**Touches**: `src/renderer/src/components/InfraChatPanel.tsx`  
**Depends on**: Task 3

### What

1. Add `lastIssueListRef` to track the last issue list from `list-issues` results.
2. Detect bulk relabel intent: "mark these as X", "relabel these as X", "add label X to these", "mark all as X", "label those as X".
3. Extract labels from the sentence using regex patterns.
4. On detection: show a confirmation card listing every affected issue (# + title) and the intended label change, with Apply / Cancel buttons.
5. On approval: call `infra:executeAction` with `bulk-relabel`, then render per-item results (✓ succeeded, ✗ failed with error).
6. On cancel: show cancellation message.
7. Error cases: no label specified → helpful message; no issues in context → "list issues first".
8. Store last issue list from `list-issues` results for "these" resolution.

### Verification

- `pnpm typecheck` passes
- Manual: "list issues labeled to-implement" → "mark these as to-refine" shows confirmation card → Apply applies labels to all

---

## Task 5: Add i18n strings

**Tier**: 1  
**Touches**: `src/renderer/src/i18n/en.json`  
**Depends on**: —

### What

Add `bulkRelabel` key group with strings for:

- `preview`: confirmation card header
- `applyQuestion`: question prompt text
- `optionApply` / `optionCancel`: button labels
- `allApplied`: success message with per-item result lines
- `partiallyApplied`: partial failure message with per-item result lines
- `applyFailed`: complete failure message
- `noLabelSpecified`: error when intent detected but no label parsed
- `noIssuesInContext`: error when no prior issue list available
- `issueNumbersRequired` / `noLabels`: main process error messages

Also update `infra.helpText` to mention "mark these as X".

### Verification

- All i18n keys referenced in code exist in en.json
