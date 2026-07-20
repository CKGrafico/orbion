# Global Settings Panel — Specification

## Settings data model

```typescript
interface GlobalSettings {
  /** UI color theme. v1 only supports "dark". */
  theme: "dark" | "light" | "system";
  /** Default agent runtime for new VM wizard sessions. */
  defaultAgentRuntime: AgentRuntime;
  /** Config-home environment ID (same as main-VM designate). */
  configHomeVmId: string | null;
  /** Ephemeral chat inactivity threshold in hours. */
  ephemeralThresholdHours: number;
}
```

## Config store changes

- Add `globalSettings: GlobalSettings` key to `ConfigSchema` with defaults:
  - `theme: "dark"`
  - `defaultAgentRuntime: "opencode"`
  - `configHomeVmId: null` (resolved from existing main VM logic)
  - `ephemeralThresholdHours: 4`
- Add `getGlobalSettings(): GlobalSettings` sync read.
- Add `updateGlobalSettings(updates: Partial<GlobalSettings>): Promise<void>` serialized write (bumps stamp and triggers config sync).

## IPC contract

Add `SettingsBridge` to `shared/ipc.ts`:

```typescript
export interface SettingsBridge {
  getSettings: () => Promise<GlobalSettings>;
  updateSettings: (updates: Partial<GlobalSettings>) => Promise<void>;
}
```

The `settings` sub-bridge is added to `LoopTaskBridge` and exposed via preload `contextBridge`.

## Settings Panel UI

- Drawer overlay that slides in from the right over the main content area.
- Width: 360px, matching the existing modal aesthetic (bg_elevated, border_subtle, radius_lg).
- Header: "Settings" title with a close button (X icon).
- Each setting is a labeled row with its control:
  - **Theme**: SegmentedTabs component with 3 options. "Light" and "System" segments are visually disabled (lowered opacity, no pointer events) with a micro "soon" badge.
  - **Default Agent Runtime**: SegmentedTabs with "OpenCode" / "Claude" options. This sets the default for new VM wizard sessions.
  - **Config-home VM**: `<select>` dropdown listing all environments, with "None" as an option. Changing this calls the existing `setMainVm` flow internally.
  - **Notification mute**: A custom toggle switch (CSS-only, styled as a pill with sliding dot). Reads/writes via `NotificationBridge.isMuted/setMuted`.
  - **Ephemeral threshold**: `<input type="number">` with min=1, max=168, step=1. Label shows "hours". Persisted to `globalSettings.ephemeralThresholdHours`.

## Sidebar integration

- Replace the existing notification mute button in the titlebar with nothing (the notification mute is now in Settings).
- Add a gear icon button (⚙ / Settings icon from lucide-react) to the sidebar footer, positioned to the left of the OrbionMark branding.
- The `onOpenSettings` callback is threaded from `App.tsx` → `Sidebar` → footer gear button.

## App.tsx integration

- `App.tsx` manages a `settingsPanelOpen: boolean` state.
- The `ephemeralThresholdHours` is read from `globalSettings` instead of the hardcoded constant.
- When the user changes the config-home VM in settings, the existing `handleStampCheckedSetMainVm` flow is used.
- The notification mute state is already managed in `App.tsx`; the settings panel reads and writes the same state.

## Mock adapter

- When `window.api` is absent, provide `settings.getSettings()` returning defaults and `settings.updateSettings()` as a no-op that updates localStorage.
