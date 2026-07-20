# Spec: Agent risk verdict on each PR

## Shared types (src/shared/ipc.ts)

### New fields on PrAwaitingReviewItem

Add `headSha` field:
```typescript
export interface PrAwaitingReviewItem {
  // ...existing fields...
  /** The HEAD SHA of the PR's branch (used for verdict cache invalidation). */
  headSha: string;
}
```

### New InfraAction

Add `"get-pr-verdict"` to `InfraAction`.

### New shared types

```typescript
/** Risk level assigned by the local heuristic analysis engine. */
export type PrRiskLevel = "low" | "medium" | "high" | "uncertain";

export interface PrVerdict {
  /** Human-readable one-line verdict. */
  verdict: string;
  /** Risk level derived from the diff analysis. */
  riskLevel: PrRiskLevel;
}

export interface GetPrVerdictParams {
  /** Repository in "owner/repo" format. */
  repo: string;
  /** PR number. */
  number: number;
}

export interface GetPrVerdictResult {
  /** The computed verdict. */
  verdict: PrVerdict;
}
```

### InboxItem extensions

Add optional fields to `InboxItem`:
- `prVerdict?: PrVerdict` — cached verdict for pr-awaiting-review items

## Main process (src/main/index.ts)

### Update GhPrJson

Add `headRefOid` to the JSON fields requested from `gh pr list`:
```typescript
interface GhPrJson {
  number: number;
  title: string;
  author: { login: string } | null;
  url: string;
  createdAt: string;
  updatedAt: string;
  headRepository: { nameWithOwner: string } | null;
  headRefOid: string; // NEW
}
```

Update the `--json` flag list in `handleListPrsAwaitingReview` to include `headRefOid`.

Map `headRefOid` to `PrAwaitingReviewItem.headSha`.

### New infra action handler: `get-pr-verdict`

Executes `gh pr diff <number> --repo <owner/repo>` via `execFile`, capturing stdout.

If CLI is not `gh`, returns an error.

Passes the raw diff string to the local heuristic analysis engine.

#### Local heuristic analysis engine

A pure function `analyzeDiff(repo: string, prNumber: number, diff: string): PrVerdict` that:

1. **Parses the unified diff** to extract:
   - Total lines added / removed
   - Number of files changed
   - File paths (to check for risk patterns)
   - Number of binary files

2. **Risk pattern detection** (file path heuristics):
   - High-risk patterns: `auth`, `credential`, `secret`, `password`, `token`, `permission`, `security`, `crypto`, `ssl`, `tls`
   - Medium-risk patterns: `config`, `env`, `docker-compose`, `Dockerfile`, `Makefile`, `.lock`, `package.json`, `tsconfig`
   - Lock file pattern: `*.lock`, `pnpm-lock.yaml`, `package-lock.json`

3. **Risk level rules** (in priority order):
   - `uncertain`: More than 500 lines changed OR more than 20 files changed OR more than 3 binary files
   - `high`: Any high-risk file pattern touched
   - `medium`: 50-500 lines changed OR any medium-risk file pattern touched
   - `low`: Fewer than 50 lines changed and no risk patterns

4. **Verdict text generation** (grounded, states uncertainty):
   - `uncertain`: "Large change ({lines} lines across {files} files), unable to fully assess risk"
   - `high`: "Touches security-sensitive files ({fileList})"
   - `medium`: "{lines} lines across {files} files, some config changes"
   - `low`: "Small change ({lines} lines in {files} file(s))"

   When the diff is empty: "No diff available, unable to assess risk" with level `uncertain`.

The analysis engine is implemented as a standalone module `src/main/diff-analyzer.ts` so it can be unit-tested independently.

## Renderer services

### IPrVerdictService (new)

```typescript
export interface IPrVerdictService {
  /** Get the cached verdict for a PR, or undefined if not yet computed. */
  getVerdict(repo: string, number: number): PrVerdict | undefined;
  /** Fetch and cache the verdict for a PR (calls the main process infra action). */
  fetchVerdict(repo: string, number: number): Promise<PrVerdict | undefined>;
  /** Subscribe to verdict updates. */
  onVerdictsUpdate(cb: () => void): () => void;
}
```

Implementation: `PrVerdictService`:
- Holds a `Map<string, PrVerdict>` keyed by `${repo}:${number}`.
- `fetchVerdict` calls `infra.executeAction({ action: "get-pr-verdict", params: { repo, number } })`.
- When `PrPollingService` updates the PR list, `PrVerdictService` checks which PRs need verdicts (missing or `headSha` changed) and fetches them sequentially with a 500ms delay between requests.
- The service stores the `headSha` alongside each verdict so it can detect when a PR head has changed and refetch.

Mock: `MockPrVerdictService` provides sample verdicts for the 3 mock PRs.

### InboxBuildParams extension

Add `prVerdicts: Map<string, PrVerdict>` to `InboxBuildParams`.

### deriveItems() extension

When building `pr-awaiting-review` items, look up the verdict from `prVerdicts`:
```typescript
const cacheKey = `${pr.repo}:${pr.number}`;
const verdict = prVerdicts.get(cacheKey);
items.push({
  // ...existing fields...
  prVerdict: verdict,
});
```

## UI updates

### InboxPanel.tsx

On the `InboxItemRow` for `pr-awaiting-review` items:
- Show the verdict text in the item detail line after the existing detail.
- Show a small colored risk-level chip/badge:
  - `low`: green background
  - `medium`: amber/yellow background
  - `high`: red background
  - `uncertain`: gray background
- If no verdict yet (still loading), show a subtle spinner or "Analyzing..." placeholder.

### InboxView.tsx

On the `InboxViewItemRow` for `pr-awaiting-review` items:
- Same verdict display as InboxPanel: verdict text + risk chip in the detail area.

### i18n (en.json)

```json
{
  "inbox": {
    "prVerdict.analyzing": "Analyzing…",
    "prRisk.low": "low",
    "prRisk.medium": "medium",
    "prRisk.high": "high",
    "prRisk.uncertain": "uncertain"
  }
}
```

## IPC validation (src/main/ipc-validation.ts)

Add `"get-pr-verdict"` to `INFRA_ACTIONS` array and exhaustiveness check.

## Preload bridge

No changes needed — the `infra.executeAction` channel already handles arbitrary `InfraAction` values.

## New module: src/main/diff-analyzer.ts

A pure, testable module:
```typescript
export function analyzeDiff(repo: string, prNumber: number, diff: string): PrVerdict;
```

Unit tests in `tests/diff-analyzer.test.ts` covering:
- Empty diff
- Small diff (low risk)
- Medium diff (medium risk)
- Large diff (uncertain)
- Diff touching high-risk files (high risk)
- Diff touching medium-risk files (medium risk)
- Binary files present
