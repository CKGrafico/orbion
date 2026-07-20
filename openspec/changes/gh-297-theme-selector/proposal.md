## Why

The settings page shows a theme selector but only dark mode is active; light and system options are disabled with "coming soon" badges. Users need at least a light theme option, plus the ability to follow their OS preference via a "system" setting. Theme choice must persist in the main-process config store so it travels with config import/export.

## What Changes

- Add a complete light-theme color scheme as CSS custom properties under `[data-theme="light"]` on `:root`
- Wire `document.documentElement.setAttribute("data-theme", ...)` from the renderer when `globalSettings.theme` changes
- Support `"system"` theme: resolve to `"light"` or `"dark"` by listening to `prefers-color-scheme` media query
- Enable the Light and System segmented buttons in `SettingsPanel.tsx` (remove disabled/coming-soon styles)
- Update i18n key `settings.themeDesc` to remove "only dark mode" wording
- Remove i18n key `settings.themeComingSoon` (no longer needed)

## Capabilities

### New Capabilities
- `theme-switching`: Multi-theme support with dark, light, and system (OS-preference) modes. Includes CSS variable overrides for light palette, data-attribute-based theme activation, and prefers-color-scheme listener for system mode.

### Modified Capabilities

## Impact

- `src/renderer/src/theme.css`: large addition of `[data-theme="light"]` variable overrides (~70 variables)
- `src/renderer/src/components/SettingsPanel.tsx`: enable light/system buttons, remove coming-soon UI
- `src/renderer/src/App.tsx`: add `useEffect` to apply `data-theme` attribute on `document.documentElement` when `globalSettings.theme` changes; add `matchMedia` listener for system mode
- `src/renderer/src/i18n/en.json`: update `settings.themeDesc`, remove `settings.themeComingSoon`
- `src/shared/ipc.ts`: remove "v1 only supports dark" comment from `GlobalSettings.theme` (type already correct)
- No IPC changes needed: `SettingsBridge`, config-store, and preload already fully support the `theme` field
