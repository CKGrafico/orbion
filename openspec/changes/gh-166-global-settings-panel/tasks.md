# Tasks — Global Settings Panel

- [ ] 1.1 Add `GlobalSettings` interface and `SettingsBridge` to `shared/ipc.ts` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [ ] 1.2 Add `globalSettings` to `ConfigSchema` with defaults, `getGlobalSettings()`, and `updateGlobalSettings()` in `config-store.ts` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/config-store.ts] -->
- [ ] 1.3 Register `settings:get` and `settings:update` IPC handlers in `main/index.ts` <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/main/index.ts] -->
- [ ] 1.4 Expose `settings` sub-bridge in `preload/index.ts` via contextBridge <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/preload/index.ts] -->
- [ ] 2.1 Create `SettingsPanel.tsx` component with all 5 settings rows and drawer UI <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/components/SettingsPanel.tsx] -->
- [ ] 2.2 Add CSS styles for SettingsPanel (drawer, toggle switch, settings row) to `theme.css` <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/theme.css] -->
- [ ] 2.3 Add i18n message IDs for all settings labels and descriptions <!-- agent: frontend-engineer.fast, depends_on: [2.1], touches: [src/renderer/src/i18n/**] -->
- [ ] 3.1 Add gear icon to Sidebar footer with `onOpenSettings` prop <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/components/Sidebar.tsx] -->
- [ ] 3.2 Integrate SettingsPanel in App.tsx: state, drawer rendering, read ephemeralThresholdHours from settings <!-- agent: frontend-engineer.build, depends_on: [2.1, 1.2, 3.1], touches: [src/renderer/src/App.tsx] -->
- [ ] 3.3 Add mock adapter for `settings` bridge in renderer mock/api layer <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/renderer/src/api.ts] -->
- [ ] 4.1 Run typecheck and fix any errors <!-- agent: frontend-engineer.fast, depends_on: [3.2, 3.3], touches: [] -->
