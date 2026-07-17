# Offer the pickup label after creating an issue

## Change ID: gh-141-pickup-label

## Description

After an issue is created via the infra chat, the agent offers the project's configured pickup label(s); accepting applies the label via the platform CLI. Pickup label names are project-level config the user can set in chat (persisted with the project).

## Rationale

Users whose loops pick issues by label (e.g. `to-implement`) currently need to manually add the label after creating an issue. By offering the pickup label right after filing, we connect creation to automation — the loop can immediately pick up the new issue.

## Scope

- Add a new `add-label` infra action to the main process that applies labels to issues via `gh issue edit` or equivalent.
- Add project-level `pickupLabels` config persisted in `config-store.ts`.
- After a successful issue creation in `InfraChatPanel`, offer to apply the configured pickup label(s) as a follow-up question.
- Support setting pickup labels via chat command (e.g. "set pickup label to-implement").
- Maintain mock adapter parity.
- Add i18n keys for all new strings.

## Out of Scope

- Fleet-wide label management.
- Creating or managing labels on the platform (only applying existing labels).
- Azure DevOps label support (ADO uses area/path tags, not labels — future work).
