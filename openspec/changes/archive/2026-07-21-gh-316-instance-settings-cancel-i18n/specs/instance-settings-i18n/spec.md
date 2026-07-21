## ADDED Requirements

### Requirement: Cancel button uses i18n key
The InstanceSettingsPanel remove-confirmation dialog SHALL render the Cancel button text using `intl.formatMessage({ id: "instanceSettings.cancel" })` instead of a hardcoded string. The `instanceSettings.cancel` key SHALL be defined in the English locale catalog (`en.json`).

#### Scenario: Cancel button is translated
- **WHEN** the user opens the remove-instance confirmation dialog
- **THEN** the Cancel button text is rendered from the i18n catalog key `instanceSettings.cancel`

#### Scenario: No hardcoded strings in remove confirmation
- **WHEN** scanning InstanceSettingsPanel.tsx for raw English strings in JSX
- **THEN** no untranslatable magic strings remain in the remove-confirmation section
