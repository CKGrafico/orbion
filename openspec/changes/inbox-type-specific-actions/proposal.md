# Type-specific inline actions on inbox items

## Change ID
inbox-type-specific-actions

## Summary
Each inbox item now carries its own verb-set, so users can dispose most items without leaving the inbox panel.

## Problem
Currently, inbox items are informational only. Users must leave the inbox, find the relevant loop card or chat, and act there. For quick triage — pause a failed loop, restart a finished one, dismiss a watch — the inbox should offer inline actions.

## Solution
- Extend `InboxItem` with a `availableActions` field computed at derivation time based on item kind + loop status.
- Add `executeInboxAction` to `IInboxService` that calls the same loop-task API endpoints the loop card uses.
- Render inline action buttons per item in `InboxItemRow`.
- Actions per kind:
  - **Failure** (`failed-loop`): Run now, Pause, Open in chat
  - **Finished** (`finished-loop`): Dismiss, Restart
  - **Watch** (`breach` / condition-tripped): Dismiss, Open in chat
  - **Offline** (`instance-offline` / `prolonged-offline`): Dismiss only (no remote action possible)
- "Open in chat" navigates to the infra chat panel scoped to the item's project/instance with the relevant card summoned.
- Results reflect immediately via the existing 5s polling loop.

## Acceptance criteria mapping
- [x] Failure: Run now, Pause, Open in chat
- [x] Finished: Dismiss, Restart
- [x] Watch: Dismiss, Open in chat
- [x] Actions call the same endpoints as the loop card and reflect results immediately
- [x] "Open in chat" opens a chat scoped to the item's project/instance with the relevant card summoned

## Affected files
- `src/shared/ipc.ts` — new action types
- `src/renderer/src/services/interfaces.ts` — `executeInboxAction`
- `src/renderer/src/services/impl/InboxService.ts` — derive actions, execute actions
- `src/renderer/src/services/mock/MockServices.ts` — mock action execution
- `src/renderer/src/features/inbox/InboxPanel.tsx` — action buttons UI
- `src/renderer/src/i18n/en.json` — action label keys
- `src/renderer/src/theme.css` — action button styles
