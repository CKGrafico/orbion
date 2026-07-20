# Archive: Global Settings Panel (Deliberately Thin)

**Change ID:** gh-166-global-settings-panel
**Archived:** 2026-07-20
**Status:** Implemented and verified

## Summary

Added a deliberately thin global settings panel to Orbion, opened from a gear icon in the sidebar footer. The panel contains exactly 5 app-wide options:

1. **Theme** — Segmented tabs (Dark/Light/System). Only Dark is functional in v1; Light and System show a "coming soon" badge.
2. **Default Agent Runtime** — Segmented tabs (OpenCode/Claude). Sets the default for new VM wizard sessions.
3. **Config-home VM** — Dropdown selecting an environment as the main VM (reuses existing setMainVm flow).
4. **Notification mute** — Toggle switch that reuses the existing NotificationBridge.
5. **Ephemeral chat threshold** — Number input (1–168 hours) that replaces the hardcoded `SWEEP_INACTIVITY_HOURS = 4` constant.

## Acceptance Criteria Verification

- [x] Settings opens from the sidebar gear icon
- [x] Contains exactly 5 app-wide options, each persisted to config
- [x] No instance-specific options appear
- [x] Mock adapter works for browser-only dev
- [x] All i18n keys are provided
- [x] Theme setting is persisted but only "dark" is functional in v1

## Files Changed

- `src/shared/ipc.ts` — Added `GlobalSettings` interface and `SettingsBridge`
- `src/main/config-store.ts` — Added `globalSettings` to ConfigSchema with get/update functions
- `src/main/index.ts` — Registered `settings:get` and `settings:update` IPC handlers
- `src/preload/index.ts` — Exposed `settings` sub-bridge via contextBridge
- `src/renderer/src/components/SettingsPanel.tsx` — New drawer component with all 5 settings
- `src/renderer/src/components/Sidebar.tsx` — Added gear icon in footer with `onOpenSettings` prop
- `src/renderer/src/App.tsx` — Integrated settings panel, state, mock loading, dynamic ephemeral threshold
- `src/renderer/src/i18n/en.json` — Added all settings i18n keys
- `src/renderer/src/theme.css` — Added drawer, toggle switch, and settings row styles
- `src/visual-evidence/scenarios/gh-166-global-settings-panel.ts` — Playwright scenario
- `src/visual-evidence/scenario-registry.ts` — Registered scenario

## Visual Evidence

- 01-settings-panel-open.webp — All 6 automated assertions passed
