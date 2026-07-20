## Design: Cross-Scope Border Crossing Announcements

### Core Concept

A **cross-scope action** is any agent action whose target `environmentId` differs from the session's home `environmentId`. The announcement pattern must:

1. **Detect** the border crossing: compare the action's target `environmentId` against the session's home `environmentId`.
2. **Announce** in both the proposal and the result: the target instance name must appear, formatted as "on **{instance}** — outside this chat's instance".
3. **Apply uniformly** across loop, task, chain-edit, sibling-offer, inbox, and platform actions.

### Detection Logic

A pure utility function `isCrossScope(actionEnvId: string, homeEnvId: string): boolean` returns true when `actionEnvId !== homeEnvId`. This is used by every surface that renders an action or its result.

### Data Model Changes

No new row kinds. Existing row types gain a computed cross-scope status derived from `row.environmentId` vs. the session's `environmentId` prop:

- `LoopProposalRow.environmentId` — already present, used for cross-scope detection
- `ChainEditProposalRow.environmentId` — already present, used for cross-scope detection
- `SiblingOfferRow.siblingEnvironmentId` — already present, compared against session's `environmentId`
- `LoopCardRow.environmentId` — already present, compared against session's `environmentId`
- Inbox actions — `InboxItem.environmentId` is available from the inbox data model (included in `InboxItem` already via the `projectId` field; environment context is passed through the inline action callback)
- Infra actions — the target `environmentId` is the `mainVmId` of the infra panel or a specific environment passed to the action

### Rendering Approach

#### 1. Loop Proposal Cards

When `row.environmentId !== sessionEnvironmentId`:
- **Proposal state (pending):** Show a cross-scope badge below the header: "on **{targetInstanceName}** — outside this chat's instance"
- **Created state:** The existing `instanceAttribution.label` already shows "on {instance}". Augment with the cross-scope announcement text.
- The badge uses a chip-style element with the `warning` semantic color (`var(--warning)`) to draw attention.

#### 2. Chain-Edit Proposal Cards

When `row.environmentId !== sessionEnvironmentId`:
- Show a cross-scope banner above the chain preview: "Editing loop on **{targetInstanceName}** — outside this chat's instance"

#### 3. Sibling Offer Cards

When `row.siblingEnvironmentId !== sessionEnvironmentId`:
- The existing attribution text includes the instance name. Add a cross-scope qualifier: "Same structure as your edited loop on **{instance}**: {loopName} (outside this chat's instance)"

#### 4. Loop Cards (in Chat Stream)

When `row.environmentId !== sessionEnvironmentId`:
- The existing `.loop-card-origin-label` already shows "{project} on {instance}". For cross-scope cards, append " — outside this chat's instance" to the label.

#### 5. Inbox Inline Actions

When an inbox action runs on a non-home instance:
- Result messages (e.g., "Paused", "Resumed", "Triggered") append "on **{instance}**" for cross-scope actions.
- The inbox panel has access to the session's home environment ID and the target environment ID from the inbox item.

#### 6. Infra Chat Panel Actions

When an infra action targets a specific environment that differs from the panel's main VM:
- Append "on **{environmentName}** — outside this chat's instance" to the result message.

### i18n Keys

```
crossScope.badge: "on {instance} — outside this chat's instance"
crossScope.loopCardLabel: "{project} on {instance} — outside this chat's instance"
crossScope.siblingAttribution: "Same structure as your edited loop on {instance}: {loopName} — outside this chat's instance"
crossScope.resultOnInstance: "{result} on {instance}"
loopProposal.crossScopeBadge: "on {instance} — outside this chat's instance"
chainEditProposal.crossScopeBanner: "Editing loop on {instance} — outside this chat's instance"
```

### CSS

A `.cross-scope-badge` class styled as a small chip using `var(--warning)` text color and `bg_elevated` background, positioned below the card header. The existing `.loop-card-origin-label` gets a `.loop-card-origin-label--cross-scope` modifier that applies `var(--warning)` text color.

### No New IPC Channels

All data needed for cross-scope detection is already available in the renderer. No changes to the main/preload layers.
