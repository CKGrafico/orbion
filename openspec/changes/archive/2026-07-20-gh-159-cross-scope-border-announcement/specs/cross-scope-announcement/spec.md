# Spec: Cross-Scope Announcement

## Requirement

Any agent action targeting a non-home scope MUST include the target in the proposal and the result message, formatted as "on **{instance}** — outside this chat's instance".

This applies uniformly to:
1. Loop proposal cards
2. Chain-edit proposal cards
3. Sibling offer cards
4. Loop cards in the chat stream
5. Inbox inline actions (run-now, pause, resume, stop)
6. Infra chat panel actions

## Detection

A cross-scope action is defined as any action whose `environmentId` (the instance where the action runs) differs from the session's home `environmentId` (the instance selected in the chat header).

The session's home `environmentId` is available as the `environmentId` prop on `SessionChatView`.

## Proposal Phase

When a proposal targets a non-home instance, the proposal card MUST display a cross-scope badge with the target instance name. The badge MUST appear before the user approves or rejects the proposal.

## Result Phase

When a completed action's result is shown, if the action ran on a non-home instance, the result message MUST include the target instance name.

## Uniformity

The same i18n key pattern and visual badge style MUST be used across all surfaces. The wording MUST be consistent: "on **{instance}** — outside this chat's instance".

## Scope

- This applies to loop proposals, chain-edit proposals, sibling offers, loop cards, inbox actions, and infra chat actions.
- Instance handoff (mid-session switch) is a separate mechanism and is NOT modified by this spec.
- The announcement is informational only; it does not block or gate the action.
