# Global Settings Panel (Deliberately Thin)

## Issue

GitHub #166 — As a user, I want a small global settings surface for truly app-wide things: theme, default agent/model, config-home selection, notification mute, ephemeral thresholds.

## Motivation

Orbion currently scatters app-wide preferences across the titlebar (notification mute button), individual environment configs (agent runtime), and nowhere at all (theme, ephemeral inactivity threshold). Users need a single, discoverable place to find and change app-wide settings. The panel must be deliberately thin: only app-wide options belong here, never instance-specific ones.

## Design

### Entry point
- A gear icon (⚙) in the sidebar footer, next to the Orbion mark. Clicking it opens the settings panel.
- The settings panel is a right-side drawer (overlaying the main content area), styled consistently with the existing modal design system.

### Settings options (5 total, all persisted to config)

| Setting | Type | Default | Storage key |
|---------|------|---------|-------------|
| Theme | segmented tabs: `dark` / `light` / `system` | `dark` | `globalSettings.theme` |
| Default Agent Runtime | segmented tabs: `opencode` / `claude` | `opencode` | `globalSettings.defaultAgentRuntime` |
| Config-home VM | dropdown of environments (or "None") | first main-VM | `globalSettings.configHomeVmId` |
| Notification mute | toggle switch | `false` | existing `NotificationBridge.setMuted()` |
| Ephemeral threshold | number input (hours) | `4` | `globalSettings.ephemeralThresholdHours` |

### Architecture

1. **Config store extension** — Add `globalSettings` object to `ConfigSchema` in `config-store.ts` with CRUD functions.
2. **IPC bridge** — Add `settings` sub-bridge to `LoopTaskBridge` with `getSettings()` and `updateSettings(partial)`.
3. **Preload** — Expose the new `settings` bridge via `contextBridge`.
4. **Main process IPC** — Register `settings:get` and `settings:update` handlers.
5. **Renderer component** — `SettingsPanel.tsx` in `components/`, using the existing modal/drawer styling pattern.
6. **Sidebar integration** — Add gear icon to sidebar footer, lifting `onOpenSettings` callback.
7. **i18n** — Add message IDs for all labels.
8. **Mock adapter** — Provide mock `window.api.settings` for browser-only dev.

### Guardrails

- No instance-specific options appear in this panel.
- Theme switching is a placeholder (v1 is dark-only; the setting is persisted for future use).
- Config-home VM selection is the same operation as the existing "Mark as main VM" flow, just presented as a dropdown.
- Notification mute reuses the existing `NotificationBridge.setMuted()` / `isMuted()` — no new persistence.
- Ephemeral threshold replaces the hardcoded `SWEEP_INACTIVITY_HOURS = 4` in `App.tsx`.

## Acceptance Criteria

1. Settings opens from the sidebar gear icon.
2. Contains exactly 5 app-wide options, each persisted to config.
3. No instance-specific options appear.
4. Mock adapter works for browser-only dev.
5. All i18n keys are provided.
6. Theme setting is persisted but only "dark" is functional in v1 (light/system show as disabled with a "Coming soon" label).
