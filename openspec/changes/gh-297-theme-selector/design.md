## Context

The app uses CSS custom properties defined in `theme.css` (`:root` block, ~70 color tokens + layout tokens). Currently only a dark palette exists. The `GlobalSettings.theme` field in `ipc.ts` already supports `"dark" | "light" | "system"`, the config-store persists it, and the `SettingsBridge` IPC round-trips it, but the renderer never applies the theme attribute and the light/system buttons are disabled.

## Goals / Non-Goals

**Goals:**
- Ship a usable light theme that inverts the dark palette: cool white/gray backgrounds, dark text, desaturated accents
- Enable all three segmented buttons (Dark, Light, System) in the settings panel
- System mode follows the OS `prefers-color-scheme` media query and reacts to live changes
- Theme persists in `electron-store` (already wired) and travels with config import/export

**Non-Goals:**
- Additional themes beyond dark/light/system (e.g. high-contrast, custom color accent)
- Per-environment or per-session theme overrides
- Animated theme transitions (can be added later)

## Decisions

1. **`data-theme` attribute on `<html>`.** Set `document.documentElement.setAttribute("data-theme", resolved)`. Light overrides live under `[data-theme="light"]` in theme.css. This avoids class toggling on every component and keeps the CSS cascade simple. The `:root` block remains the dark default (no attribute needed for dark).

2. **Light palette: invert the dark scheme with warm whites.** Frame `#f4f5f7`, panel `#ffffff`, sidebar `#edf0f4`, text primary `#1a1d23`, accent stays `#6b9e1f` (darker lime for contrast on white). All status/health/pill tokens desaturated for light backgrounds. `--accent-ink` flips to white. Borders use light grays.

3. **System mode via `matchMedia` listener.** In App.tsx, a `useEffect` resolves `system` to `dark`/`light` using `window.matchMedia("(prefers-color-scheme: dark)")`. The listener is cleaned up on unmount. When theme is `system`, the app also registers an `addEventListener("change", ...)` to react to OS theme changes in real time.

4. **No new IPC channels.** The existing `settings:get` / `settings:update` flow handles everything. The renderer calls `window.api.settings.updateSettings({ theme })` and the main-process config-store persists it.

## Risks / Trade-offs

- [Large CSS diff] The light theme block adds ~70 variable overrides. Mitigation: single `[data-theme="light"]` block at the top of theme.css, well-structured, easy to audit.
- [Edge-case: highlight.js overrides] The `theme.css` file has highlight.js dark-theme overrides at line ~4641. Need corresponding light-theme overrides or a `[data-theme="light"]` scoped version. Mitigation: add a light code-block override block.
- [Flash of wrong theme on startup] The renderer loads with dark defaults until `getSettings()` resolves. Mitigation: acceptable for now; the settings load is near-instant from local electron-store. Could later add a preload script that reads the store synchronously.
