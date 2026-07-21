## 1. i18n Key and Component Fix

- [x] 1.1 Add `instanceSettings.cancel` key to `src/renderer/src/i18n/en.json` <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/renderer/src/i18n/en.json] -->
- [x] 1.2 Replace hardcoded "Cancel" with `intl.formatMessage({ id: "instanceSettings.cancel" })` in `src/renderer/src/components/InstanceSettingsPanel.tsx` line 340 <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/renderer/src/components/InstanceSettingsPanel.tsx] -->

## 2. Verification

- [x] 2.1 Run `pnpm typecheck` and confirm no errors <!-- agent: frontend-engineer.fast, depends_on: [1.2], touches: [] -->
