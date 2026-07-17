# Spec: create-issue infra action

## Overview

A new `InfraAction` that creates a GitHub issue or ADO work item from the chat interface.

## IPC contract changes (src/shared/ipc.ts)

Extend `InfraAction`:
```ts
export type InfraAction = "machine-status" | "clone-repo" | "create-issue";
```

New request shape (passed via `InfraActionArgs.params`):
```ts
export interface CreateIssueParams {
  title: string;
  body: string;
  labels?: string[];
  /** GitHub repo in "owner/repo" format. Defaults to the configured repo if available. */
  repo?: string;
}
```

New result shape (returned in `InfraActionResult.data`):
```ts
export interface CreateIssueResult {
  platform: "github" | "ado";
  url: string;
  number?: number;
}
```

## Main process handler (src/main/index.ts)

Add a `"create-issue"` case before the `default` case in the `infra:executeAction` handler:

1. Extract `CreateIssueParams` from `args.params`
2. Validate `title` is non-empty
3. Detect platform: try `gh auth status` first; if `gh` is not found, try `az`; if neither is available, return an actionable error
4. For GitHub: run `gh issue create --title <escaped-title> --body <escaped-body> [--label <label>]... [--repo <repo>]`
5. For ADO: run `az boards work-item create --title <escaped-title> --description <escaped-body> --type Issue`
6. Parse the output URL from the CLI
7. Return `{ ok: true, data: { platform, url, number } }`

### Error cases

- `gh` not found and `az` not found: return `{ ok: false, error: msg("issues.noPlatformCli") }`
- `gh` found but not authenticated: return `{ ok: false, error: msg("issues.ghNotAuth") }`
- `az` found but not authenticated: return `{ ok: false, error: msg("issues.azNotAuth") }`
- Missing title: return `{ ok: false, error: msg("issues.titleRequired") }`
- CLI execution fails: return `{ ok: false, error: msg("issues.createFailed", { detail: stderr }) }`

### Security

- Use `child_process.execFile` (not `exec`) to avoid shell injection
- All string arguments are passed as array elements to `execFile`, not interpolated into a command string

## Renderer changes (src/renderer/src/components/InfraChatPanel.tsx)

Extend the prompt parser in `handleSendPrompt`:

1. Detect "create issue" intent when the prompt contains keywords like "create issue", "file issue", "new issue", "open issue"
2. Parse title and body from the prompt (first line as title, rest as body)
3. Create a turn with a `QuestionRequest` asking the user to confirm the draft: options are "File issue" and "Cancel"
4. On "File issue" answer, call `infraService.executeAction({ action: "create-issue", params: { title, body } })`
5. Format the response: show the issue URL as a clickable markdown link

## i18n keys (src/renderer/src/i18n/en.json)

New keys under `"issues"` namespace:

- `issues.draftTitle`: "Draft issue"
- `issues.fileQuestion`: "File this issue?"
- `issues.optionFile`: "File issue"
- `issues.optionCancel`: "Cancel"
- `issues.created`: "Issue created: {url}"
- `issues.createFailed`: "**Failed to create issue:** {detail}"
- `issues.noPlatformCli`: "No platform CLI found. Install `gh` (GitHub CLI) or `az` (Azure CLI) to create issues from chat."
- `issues.ghNotAuth`: "GitHub CLI is not authenticated. Run `gh auth login` in a terminal first."
- `issues.azNotAuth`: "Azure CLI is not authenticated. Run `az login` in a terminal first."
- `issues.titleRequired`: "Issue title is required."
- `issues.helpText`: "I can also create issues. Try:\n- create issue: file a new GitHub issue or ADO work item"
