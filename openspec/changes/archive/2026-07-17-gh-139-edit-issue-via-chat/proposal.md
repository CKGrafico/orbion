# Edit an issue / work item via chat

## Change ID

`gh-139-edit-issue-via-chat`

## Description

Add conversational editing of existing issues/work items through the infrastructure chat panel. Given an item reference (number or URL), the agent applies the user's requested changes (title, body, labels) via the platform CLI and confirms with a summary of what changed. Ambiguous references are clarified before any change is applied.

## Rationale

Orbion is chat-first; all entity management surfaces through conversation. The existing `create-issue`, `list-issues`, and `add-label` actions already let users file and browse issues from the InfraChatPanel. Editing is the natural next step: once a user has created or discovered an issue, they should be able to refine it conversationally ("rename issue 42 to X", "add label bug to issue 38") without leaving the chat.

## Scope

- New `edit-issue` infra action that calls `gh issue edit` (GitHub) or `az boards work-item update` (Azure DevOps)
- Intent detection in InfraChatPanel for edit/update/rename issue commands
- Confirmation-before-mutation UX: the assistant shows a diff preview and asks for confirmation before applying changes
- Ambiguous reference clarification: if the user's reference cannot be resolved to a single issue, the assistant asks for clarification
- Mock counterpart for browser-only dev
- i18n keys for all user-facing strings

## Out of scope

- Editing issues on platforms other than GitHub and Azure DevOps
- Bulk edit operations (editing multiple issues at once)
- Edit history / audit trail (the platform CLI handles this)
- New navigation surfaces (sidebar tabs, dashboards)
