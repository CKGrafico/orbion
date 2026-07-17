# Cold-open component spec

## Component: `ColdOpen`

Renders when `environments.length === 0 && loaded === true`.

### Props
- `onAddVm: () => void` — callback to open the AddVmWizard

### Layout
A full-height centered flex column filling the `main-panel`. Contains:
1. `OrbionMark` (size 40) — brand icon
2. `<h2>` — "Welcome to Orbion" (i18n key: `coldOpen.headline`)
3. `<p>` — Teaching copy: "Orbion talks to loop-task daemons running on your machines. Adding one machine is the only setup you need — then you can start managing loops and tasks right away." (i18n key: `coldOpen.copy`)
4. `<button>` — "Add your first machine" (i18n key: `coldOpen.addFirstMachine`), triggers `onAddVm`

### CSS
- `.cold-open` — flex column, centered, full height/width, 16px gap, 40px padding
- `.cold-open-headline` — 20px, 700 weight, primary text color
- `.cold-open-copy` — 13.5px, secondary text color, max-width 400px, 1.6 line-height
- `.cold-open-btn` — extends `.btn.primary`, 13.5px font, 600 weight, 9px 24px padding

### App integration
In `App.tsx`, when `isColdOpen` (loaded && environments.length === 0):
- The `<div className="body">` renders only a single `<div className="panel main-panel">` containing `<ColdOpen>`.
- The sidebar, InfraChatPanel, and content rendering are all suppressed.
- The titlebar omits the sidebar toggle and mute button.
