# Spec: List Issues Infra Action

## IPC Contract

Add to `src/shared/ipc.ts`:

```typescript
export type InfraAction = "machine-status" | "clone-repo" | "create-issue" | "detect-platform" | "list-issues";

export interface ListIssuesParams {
  /** Filter by label (GitHub). Multiple labels comma-separated. */
  labels?: string;
  /** Filter by state: "open" (default), "closed", "all". */
  state?: "open" | "closed" | "all";
  /** GitHub repo in "owner/repo" format. Defaults to the current repository if available. */
  repo?: string;
  /** Maximum number of issues to return (default 20). */
  limit?: number;
}

export interface IssueCard {
  number: number;
  title: string;
  url: string;
  labels: string[];
  state: "open" | "closed";
  createdAt: string;
  updatedAt: string;
}

export interface ListIssuesResult {
  platform: "github" | "ado";
  issues: IssueCard[];
  total: number;
  truncated: boolean;
}
```

## Main Process Handler

In `src/main/index.ts`, add `list-issues` case to the `infra:executeAction` handler:

- If `gh` is available and authenticated: run `gh issue list --json number,title,url,labels,state,createdAt,updatedAt --limit N --state STATE [--label LABEL] [--repo REPO]`
- Parse JSON output into `ListIssuesResult`
- If `az` is available, use `az boards query` (limited label support)
- If no CLI or not authenticated, return appropriate error

## Renderer: InfraChatPanel Intent Recognition

Add pattern matching for issue-listing queries:
- "what's labeled X?", "show issues", "list issues", "what's ready to implement?", "backlog", "to-implement", "issues labeled X"
- Detect optional label filter from the query text
- Call `infraService.executeAction({ action: "list-issues", params: { labels, state, repo } })`

## Renderer: Card Stack Rendering

Format the `ListIssuesResult` as a markdown list with `issue://` links:
```
**3 issues labeled to-implement:**

- [#42](issue://42) Setup CI pipeline `to-implement` `devops`
- [#38](issue://38) Add error boundary `to-implement`
- [#31](issue://31) Implement auth flow `to-implement` `security`

Showing 3 of 47. Refine your query to narrow results.
```

Clicking `issue://` links opens the issue URL in the system browser.

## Mock Service

`MockInfraService.executeAction` handles `list-issues` by returning 3 sample `IssueCard` items.
