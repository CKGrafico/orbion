## Context

The InstanceSettingsPanel remove-confirmation dialog has a hardcoded "Cancel" string at line 340. The project guardrail requires all user-facing copy to go through i18n keys. Every other label in the same component already uses `intl.formatMessage`.

## Goals / Non-Goals

**Goals:**
- Replace the hardcoded "Cancel" with an i18n key so the translation pipeline picks it up.
- Use the `instanceSettings.*` key namespace to stay consistent with the rest of the component.

**Non-Goals:**
- Extracting or consolidating shared "Cancel" keys across the app (out of scope for this bug fix).
- Adding new locale files (only `en.json` exists today).

## Decisions

- **Key name: `instanceSettings.cancel`** rather than reusing `app.removeCancel` or `vmWizard.cancel`. The `instanceSettings` namespace is already the convention for keys used in this component. Cross-namespace reuse can be evaluated later during a broader i18n consolidation.

## Risks / Trade-offs

- Potential duplication with other "Cancel" keys (`app.removeCancel`, `loopCard.confirmCancel`, `vmWizard.cancel`). This is acceptable: the existing codebase already has multiple Cancel keys per domain, and consolidating them risks breaking existing translated catalogs.
