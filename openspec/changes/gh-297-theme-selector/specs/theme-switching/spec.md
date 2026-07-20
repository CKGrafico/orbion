## ADDED Requirements

### Requirement: Theme selector in settings
The settings panel SHALL present a segmented control with three theme options: Dark, Light, and System. All three options SHALL be clickable. The currently active theme SHALL be visually indicated with the `.active` class on the corresponding segment button.

#### Scenario: User selects light theme
- **WHEN** the user clicks the "Light" segment in the theme selector
- **THEN** the `data-theme` attribute on `<html>` SHALL be set to `"light"` and the `globalSettings.theme` value SHALL be persisted as `"light"` via the settings IPC bridge

#### Scenario: User selects dark theme
- **WHEN** the user clicks the "Dark" segment in the theme selector
- **THEN** the `data-theme` attribute on `<html>` SHALL be set to `"dark"` and the `globalSettings.theme` value SHALL be persisted as `"dark"` via the settings IPC bridge

#### Scenario: User selects system theme
- **WHEN** the user clicks the "System" segment in the theme selector
- **THEN** the `globalSettings.theme` value SHALL be persisted as `"system"` and the `data-theme` attribute on `<html>` SHALL be resolved to `"dark"` or `"light"` based on the OS `prefers-color-scheme` media query

### Requirement: Light theme CSS variable overrides
When `data-theme="light"` is set on the document root, all CSS custom properties used by the app SHALL have visually appropriate light-mode values. The light palette SHALL provide readable contrast: dark text on light backgrounds, desaturated status colors, and an accent color that passes WCAG AA contrast on white.

#### Scenario: Light theme applies correct background colors
- **WHEN** `data-theme="light"` is set on `<html>`
- **THEN** `--bg-frame` SHALL resolve to a light gray, `--bg-panel` SHALL resolve to white, and `--text-primary` SHALL resolve to a dark color

#### Scenario: Light theme accent is visible on white
- **WHEN** `data-theme="light"` is set on `<html>`
- **THEN** `--accent` SHALL resolve to a color with sufficient contrast on the light `--bg-panel`

### Requirement: System theme follows OS preference
When the global theme setting is `"system"`, the app SHALL resolve the active theme to `"dark"` or `"light"` by querying `window.matchMedia("(prefers-color-scheme: dark)")`. The app SHALL react to live OS theme changes by updating the resolved `data-theme` attribute without requiring a restart or manual setting change.

#### Scenario: System theme resolves to dark when OS is dark
- **WHEN** `globalSettings.theme` is `"system"` and the OS color scheme is dark
- **THEN** `data-theme` SHALL be `"dark"`

#### Scenario: System theme resolves to light when OS is light
- **WHEN** `globalSettings.theme` is `"system"` and the OS color scheme is light
- **THEN** `data-theme` SHALL be `"light"`

#### Scenario: System theme reacts to OS change
- **WHEN** `globalSettings.theme` is `"system"` and the OS color scheme changes from dark to light
- **THEN** `data-theme` SHALL update from `"dark"` to `"light"` without user interaction

### Requirement: Theme persists across restarts
The selected theme SHALL be stored in the main-process config store as part of `GlobalSettings.theme`. On app startup, the renderer SHALL read the stored theme and apply the corresponding `data-theme` attribute before the first meaningful paint.

#### Scenario: Theme preserved after restart
- **WHEN** the user sets theme to "light", closes the app, and reopens it
- **THEN** the `data-theme` attribute SHALL be `"light"` on startup

### Requirement: Theme travels with config import/export
Since `theme` is part of `GlobalSettings` which is persisted in the `electron-store` config, it SHALL be included when the config is exported and restored when imported on another machine.

#### Scenario: Config import restores theme
- **WHEN** a config exported from a machine with theme set to "light" is imported on another machine
- **THEN** the imported machine SHALL have theme set to "light" and display in light mode
