# Filtered issue stack: "what's ready to implement?"

## Issue

GitHub #140

## Description

As a user, I want to ask for a filtered slice of the backlog and get a compact card stack, not a list surface. Queries like "what's labeled to-implement?" should return a compact stack of issue cards (number, title, labels) via the platform CLI. Each card links out and can seed follow-ups ("open #42", "relabel these"). No persistent backlog browsing surface is introduced.

## Design

The implementation extends the existing InfraChatPanel (the conversational infrastructure assistant) with a new `list-issues` infra action. When the user asks a backlog-query question (e.g. "what's labeled to-implement?", "show me issues", "what's ready to implement?"), the chat recognises the intent, calls `gh issue list` (or `az boards query`) via the main process, and renders the results as a compact card stack in the chat stream.

Key design decisions:
1. **No new navigation surface**. Issue cards appear only in the InfraChatPanel as chat messages, consistent with Orbion's "chat is the verb" principle.
2. **Compact card stack, not a table**. Each card shows: issue number, title, labels (as chips). Cards are clickable and link out to the browser.
3. **Follow-up seeding**. The markdown answer includes `issue://` links that can be intercepted for actions like "open #42" (opens in system browser) or future "relabel these" support.
4. **Reuses the existing infra action pipeline**. A new `InfraAction` type `list-issues` is added to the IPC contract and handled in the main process using `gh issue list` or `az boards query`.
5. **Mock adapter**. The MockInfraService returns sample issue data in browser-only dev mode.

## Scope

- New IPC type: `ListIssuesParams` / `ListIssuesResult` in `src/shared/ipc.ts`
- New infra action: `list-issues` in main process (`src/main/index.ts`)
- New query pattern in `InfraChatPanel.tsx` for issue-listing intent
- New markdown rendering with clickable `issue://` links
- i18n keys for issue stack messages
- Mock service update in `MockServices.ts`
- Styling for compact issue cards in `theme.css`
