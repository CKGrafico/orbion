## 1. Light theme CSS

- [x] 1.1 Add `[data-theme="light"]` block to `theme.css` with all ~70 CSS variable overrides (backgrounds, text, borders, accents, status, health, pill colors) <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/theme.css] -->

## 2. Theme application logic

- [x] 2.1 Add `useEffect` in `App.tsx` that sets `data-theme` on `document.documentElement` when `globalSettings.theme` changes, resolves `"system"` via `matchMedia`, and registers a `change` listener for live OS theme updates <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/App.tsx] -->

## 3. Settings panel UI

- [x] 3.1 Enable Light and System segmented buttons in `SettingsPanel.tsx` (remove disabled styles, coming-soon badges, pointer-events:none) and wire them to `handleThemeChange` <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/components/SettingsPanel.tsx] -->

## 4. i18n and cleanup

- [x] 4.1 Update `en.json`: change `settings.themeDesc` to remove "only dark" wording, remove `settings.themeComingSoon` key, remove `settings.soon` key <!-- agent: frontend-engineer.fast, depends_on: [3.1], touches: [src/renderer/src/i18n/en.json] -->
- [x] 4.2 Update `ipc.ts`: remove "v1 only supports dark" comment from `GlobalSettings.theme` JSDoc <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/shared/ipc.ts] -->

## 5. Verification

- [x] 5.1 Run `pnpm typecheck` and fix any errors <!-- agent: frontend-engineer.fast, depends_on: [4.1, 4.2], touches: [] -->
