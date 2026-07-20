# Spec: PR-awaiting-review inbox items

## Shared types (src/shared/ipc.ts)

### New InboxItemKind

Add `"pr-awaiting-review"` to the `InboxItemKind` union.

### NotificationType mapping

`pr-awaiting-review` maps to `"watch"` in `kindToNotificationType` — it's an attention item, not a failure.

### New InfraAction

Add `"list-prs-awaiting-review"` to `InfraAction`.

### New shared types

```typescript
export interface PrAwaitingReviewItem {
  /** PR number */
  number: number;
  /** PR title */
  title: string;
  /** Repository in "owner/repo" format */
  repo: string;
  /** PR author login */
  author: string;
  /** PR URL */
  url: string;
  /** ISO timestamp of PR creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
}

export interface ListPrsAwaitingReviewParams {
  /** GitHub repo in "owner/repo" format. Omit for all repos the CLI can see. */
  repo?: string;
  /** Maximum number of PRs to return (default 30). */
  limit?: number;
}

export interface ListPrsAwaitingReviewResult {
  platform: "github";
  prs: PrAwaitingReviewItem[];
  total: number;
  truncated: boolean;
}
```

### InboxItem extensions

Add optional fields to `InboxItem`:
- `prNumber?: number` — PR number for pr-awaiting-review items
- `prRepo?: string` — repo in owner/repo format
- `prAuthor?: string` — author login
- `prUrl?: string` — link to the PR

### Resolution reason

Add `"pr-resolved"` to `InboxItemResolutionReason` — used when a PR is no longer awaiting review.

## Main process (src/main/index.ts)

### New infra action handler: `list-prs-awaiting-review`

Executes `gh pr list --search review-required --json number,title,author,url,createdAt,updatedAt,isDraft,headRepository` with optional `--repo` and `--limit` flags.

Uses `resolvePlatformCli` with `i18nPrefix: "issues"`. If CLI is `az`, returns an error (ADO PR review filtering not supported).

GH PR JSON format:
```typescript
interface GhPrJson {
  number: number;
  title: string;
  author: { login: string };
  url: string;
  createdAt: string;
  updatedAt: string;
  headRepository: { nameWithOwner: string } | null;
}
```

## Renderer services

### IPrPollingService (new)

```typescript
export interface IPrPollingService {
  /** Start polling for PRs on the main VM (60s interval). */
  startPolling(): void;
  /** Stop polling. */
  stopPolling(): void;
  /** Get currently polled PRs awaiting review. */
  getPrs(): PrAwaitingReviewItem[];
  /** Subscribe to PR list updates. */
  onPrsUpdate(cb: (prs: PrAwaitingReviewItem[]) => void): () => void;
}
```

Implementation: `PrPollingService` calls `infra.executeAction({ action: "list-prs-awaiting-review", params: {} })` every 60 seconds. Only runs when the main VM is connected.

Mock: `MockPrPollingService` returns 2-3 sample PRs from mock data.

### InboxBuildParams extension

Add `prAwaitingReview: PrAwaitingReviewItem[]` to `InboxBuildParams`.

### deriveItems() extension

New section after budget breaches:
```typescript
for (const pr of prAwaitingReview) {
  const itemId = `pr-awaiting-review:${pr.repo}:${pr.number}`;
  if (dismissedIds.has(itemId)) continue;
  items.push({
    id: itemId,
    kind: "pr-awaiting-review",
    notificationType: "watch",
    environmentId: mainVmEnvId,  // PRs come from the main VM
    environmentName: mainVmEnvName,
    title: pr.title,
    detail: `#${pr.number} in ${pr.repo} by @${pr.author}`,
    occurredAt: pr.updatedAt,
    dismissed: false,
    availableActions: getAvailableActions("pr-awaiting-review"),
    prNumber: pr.number,
    prRepo: pr.repo,
    prAuthor: pr.author,
    prUrl: pr.url,
  });
}
```

### getAvailableActions extension

`pr-awaiting-review` → `["dismiss", "open-in-chat"]`

#### Self-resolution

`pr-awaiting-review` resolves with reason `"pr-resolved"`.

## UI updates

### InboxView.tsx

- Add `GitPullRequest` icon from lucide-react for `pr-awaiting-review` kind
- Color: `var(--accent-blue)` (informational / watch-type)
- Detail line shows: `#123 in owner/repo by @author`
- Available actions: dismiss + open-in-chat

### i18n (en.json)

```json
{
  "inbox": {
    "prAwaitingReview": "PR awaiting review",
    "resolution.pr-resolved": "PR no longer awaiting review",
    "action.approve-pr": "Approve",
    "action.request-changes": "Request changes"
  }
}
```

## IPC validation (src/main/ipc-validation.ts)

Add `"list-prs-awaiting-review"` to `INFRA_ACTIONS` array and exhaustiveness check.

## Preload bridge

No changes needed — the `infra.executeAction` channel already handles arbitrary `InfraAction` values.

## Mock adapter

`MockPrPollingService` provides 2-3 sample PRs:
```typescript
const mockPrs: PrAwaitingReviewItem[] = [
  {
    number: 42,
    title: "Add retry logic to SSH tunnel reconnection",
    repo: "acme/orbion",
    author: "loop-bot",
    url: "https://github.com/acme/orbion/pull/42",
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
    updatedAt: new Date(Date.now() - 1800_000).toISOString(),
  },
  {
    number: 15,
    title: "Fix budget breach auto-pause race condition",
    repo: "acme/orbion",
    author: "dependabot",
    url: "https://github.com/acme/orbion/pull/15",
    createdAt: new Date(Date.now() - 7200_000).toISOString(),
    updatedAt: new Date(Date.now() - 3600_000).toISOString(),
  },
];
```
