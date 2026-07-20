# infra-handlers.ts API

Exports a single function registered under the `infra:executeAction` IPC channel.

```ts
function handleInfraExecuteAction(args: InfraActionArgs): Promise<InfraActionResult>
```

Handles all infra action cases: machine-status, clone-repo, detect-platform, create-issue, list-issues, add-label, edit-issue, bulk-relabel, list-prs-awaiting-review, get-pr-verdict, get-pr-diff, get-pr-briefing, submit-pr-review, open-pr-in-browser.

Plus individual handler functions for PR operations:

- `handleListIssues(args: InfraActionArgs): Promise<InfraActionResult>`
- `handleListPrsAwaitingReview(args: InfraActionArgs): Promise<InfraActionResult>`
- `handleGetPrVerdict(args: InfraActionArgs): Promise<InfraActionResult>`
- `handleGetPrDiff(args: InfraActionArgs): Promise<InfraActionResult>`
- `handleGetPrBriefing(args: InfraActionArgs): Promise<InfraActionResult>`
- `handleSubmitPrReview(args: InfraActionArgs): Promise<InfraActionResult>`
- `handleOpenPrInBrowser(args: InfraActionArgs): Promise<InfraActionResult>`

These are the existing inline handlers extracted verbatim, no logic changes.
