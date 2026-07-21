## Why

The remove-instance confirmation dialog in `InstanceSettingsPanel.tsx` (line 340) renders a hardcoded `"Cancel"` string instead of using `intl.formatMessage`. Every other button in this file and across the codebase uses i18n keys. This breaks the translation pipeline and leaves the Cancel button untranslated for non-English locales.

## What Changes

- Replace hardcoded `"Cancel"` on line 340 of `InstanceSettingsPanel.tsx` with `intl.formatMessage({ id: "instanceSettings.cancel" })`.
- Add the `"cancel": "Cancel"` key to the `instanceSettings` section in `src/renderer/src/i18n/en.json`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `instance-settings-i18n`: Cancel button text must come from the i18n catalog, consistent with all other labels in InstanceSettingsPanel.

## Impact

- `src/renderer/src/components/InstanceSettingsPanel.tsx`: one string replacement.
- `src/renderer/src/i18n/en.json`: one key added to `instanceSettings` section.
- No API, dependency, or cross-process changes.
