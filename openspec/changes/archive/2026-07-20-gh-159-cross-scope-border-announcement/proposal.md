## Why

When a user acts outside their chat's home scope (e.g., the agent creates a loop on a different instance, or the inbox triggers an action on a non-home instance), the user receives no explicit indication that the action crossed a border. This violates the design model's requirement that "cross-scope actions announce themselves" and makes it possible for the user to misunderstand where an action took effect, which is a safety concern in a multi-instance environment.

## What Changes

- Loop proposal cards targeting a non-home instance will include the target instance name in both the proposal body and the result message (e.g., "created on **prod-vm** — outside this chat's instance").
- Loop card origin labels already attribute loops to their originating instance in fleet mode; this existing pattern will be reused and made more explicit for cross-scope scenarios (not just fleet mode).
- Chain-edit proposal cards will show a cross-scope badge when the target loop lives on a non-home instance.
- Sibling offer cards already attribute the sibling instance; a "cross-scope" annotation will be added when the sibling is outside the home scope.
- Inbox inline actions (run-now, pause, resume, stop) that target a non-home instance will include the target instance name in the result message.
- Infra chat panel actions that operate on a different instance than the main VM will note the target.
- A new i18n key group `crossScope` will provide consistent formatting for the border-crossing announcement across all surfaces.

## Capabilities

### New Capabilities
- `cross-scope-announcement`: A uniform announcement pattern for agent actions targeting a non-home scope. Includes detection logic (comparing action's environmentId against the session's home environmentId), i18n keys, and rendering in proposal cards, result messages, loop cards, inbox actions, and infra chat.

### Modified Capabilities
- `instance-handoff`: The existing instance-handoff divider already handles scope switches mid-session. Cross-scope announcements complement this by annotating individual actions that target other scopes without a full switch.

## Impact

- **Renderer**: `SessionChatView.tsx` (loop proposal, chain-edit proposal, sibling offer rendering), `LoopProposalCard.tsx` (cross-scope badge), `ChainEditProposalCard.tsx` (cross-scope badge), `SiblingOfferCard.tsx` (cross-scope badge), `InfraChatPanel.tsx` (infra action result attribution), `InboxPanel.tsx` (inline action result attribution)
- **i18n**: New keys in `en.json` under `crossScope.*`
- **Chat types**: No new row kinds needed; existing rows gain a `crossScopeTarget` optional field
- **Theme**: Minor CSS additions for the cross-scope badge styling
