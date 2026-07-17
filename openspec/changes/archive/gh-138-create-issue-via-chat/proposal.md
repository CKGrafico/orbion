# gh-138: Create an issue / work item via chat

## Problem

Users need to describe a problem and have the agent draft and file it as a GitHub issue or ADO work item. Today the infra chat can run `machine-status` and `clone-repo` actions, but there is no way to create tracking items from the chat interface.

## Solution

Extend the existing `InfraAction` system with a new `"create-issue"` action that:
1. Receives the issue title and body from the chat prompt
2. Detects the available platform CLI (`gh` for GitHub, `az` for Azure DevOps)
3. Shows the draft to the user for approval (leveraging the existing `QuestionRequest` flow)
4. Executes the CLI command in the main process
5. Returns the created issue URL to the chat

If the platform CLI is missing or unauthenticated, a clear actionable error is returned.

## Impact

- **src/shared/ipc.ts**: Extend `InfraAction` union with `"create-issue"`, add `CreateIssueArgs` and `CreateIssueResult` types
- **src/main/index.ts**: Add `"create-issue"` case in the `infra:executeAction` handler, spawning `gh issue create` or `az boards work-item create`
- **src/renderer/src/components/InfraChatPanel.tsx**: Add prompt parsing for "create issue" intent, add `QuestionRequest` flow for approval, format the response with the issue URL
- **src/renderer/src/i18n/en.json**: Add i18n keys for issue creation messages and errors
- **src/renderer/src/services/mock/MockServices.ts**: Add mock implementation for `"create-issue"` action

## Risks

- `gh` and `az` CLIs may not be installed on the host machine. The main process must detect this and return a clear error before attempting to run the command.
- The `gh` CLI requires auth (`gh auth status`). Unauthenticated state must produce an actionable error message.
- Shell injection: all parameters passed to the CLI must be properly escaped.
