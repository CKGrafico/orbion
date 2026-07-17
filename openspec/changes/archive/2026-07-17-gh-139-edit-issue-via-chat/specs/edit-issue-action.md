# Edit Issue Action Spec

## InfraAction extension

Add `"edit-issue"` to the `InfraAction` union type.

## New IPC types

### EditIssueParams

```typescript
export interface EditIssueParams {
  /** Issue number on the platform. */
  issueNumber: number;
  /** New title. Omit to keep the current title. */
  title?: string;
  /** New body/description. Omit to keep the current body. */
  body?: string;
  /** Labels to ADD (appended to existing). */
  addLabels?: string[];
  /** Labels to REMOVE from the issue. */
  removeLabels?: string[];
  /** GitHub repo in "owner/repo" format. Defaults to the current repository. */
  repo?: string;
}
```

### EditIssueResult

```typescript
export interface EditIssueResult {
  platform: "github" | "ado";
  issueNumber: number;
  /** Fields that were actually changed. */
  changes: {
    title?: boolean;
    body?: boolean;
    labelsAdded?: string[];
    labelsRemoved?: string[];
  };
}
```

## CLI commands

### GitHub (`gh`)

```bash
gh issue edit <number> \
  [--title "new title"] \
  [--body "new body"] \
  [--add-label "label1,label2"] \
  [--remove-label "label3"] \
  [--repo "owner/repo"]
```

### Azure DevOps (`az`)

```bash
az boards work-item update \
  --id <number> \
  [--title "new title"] \
  [--description "new body"]
```

Note: `az boards` does not have native label/tag add/remove via CLI. For ADO, labels are managed through the web UI. The action will report `ok: false` with a clear error message if label operations are attempted on ADO, and will support title/body edits only.

## Confirmation flow

The chat panel shows a preview card of the proposed changes before executing the edit, as a question with "Apply changes" / "Cancel" options. This matches the existing create-issue confirmation pattern.

## Ambiguous reference handling

If the user provides an incomplete reference (e.g. "edit the bug issue" without a number), the assistant responds asking the user to specify the issue number or URL. No mutation occurs without a confirmed numeric reference.
