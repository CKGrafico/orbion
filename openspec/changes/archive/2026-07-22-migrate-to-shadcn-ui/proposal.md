## Why

Orbion's renderer uses a single 8746-line `theme.css` with plain CSS custom properties and no component library. Every UI primitive — modals, menus, drawers, popovers — is hand-rolled with duplicated backdrop/dropdown patterns across 40+ component files. Adding new UI requires writing CSS from scratch. This is unsustainable: maintenance cost grows with every component, accessibility is inconsistent, and there is no shared primitive layer. shadcn/ui (backed by Tailwind CSS v4 and Radix UI) provides accessible, composable, copy-paste-owned primitives that eliminate this duplication while preserving full theme control via CSS variables.

## What Changes

- **BREAKING**: Introduce Tailwind CSS v4 as the utility layer backing shadcn/ui. This requires the `@tailwindcss/vite` plugin in both `electron.vite.config.ts` and `vite.web.config.ts`, plus `@import "tailwindcss"` in the renderer's CSS entry.
- Initialize shadcn/ui with `npx shadcn@latest init` (new-york style, CSS variables enabled, `components.json` at repo root).
- Map Orbion's existing design tokens (navy/lime palette, radii, typography) to shadcn's CSS variable format so the dark theme is the default — no visual regression.
- Add Radix UI primitives, `class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/react-slot` as direct dependencies. Add a `radix-ui` manual chunk to `electron.vite.config.ts`.
- Install the `shadcn` skill on the `frontend-engineer` agent; remove `@accelint-design-foundation` from its Abilities.
- Rewrite project guardrails: GR-STYLE-004 becomes "shadcn/ui first" policy; GR-DEP-002 adds Tailwind + shadcn as an approved exception.
- Update ARCHITECTURE.md §7 styling row from "Plain CSS + custom properties" to "Tailwind CSS v4 + shadcn/ui on top of Orbion design-token CSS variables".
- Add Orbion token → shadcn variable mapping table to DESIGN.md.
- Migrate menus: Sidebar context menu → `DropdownMenu`/`ContextMenu`; FleetActivityReadout popover → `Popover` (P0 acceptance gate).
- Migrate modals: all `modal-backdrop` patterns across App.tsx, AddVmWizard, PickMainVmModal, RestoreOffer, StaleConfigWarning, ReviewModeOverlay → `Dialog`/`AlertDialog`.
- Migrate drawers: SettingsPanel, InstanceSettingsPanel, BudgetWatchPanel → `Sheet` (side="right").
- Catalog pass: replace plain `<button>`, `<input>`, and other primitives across ~30 component files with shadcn equivalents (`Button`, `Input`, `Card`, `Badge`, `Tabs`, `Tooltip`, `ScrollArea`, `Checkbox`, `Switch`, `Select`, `Separator`).
- Dead CSS cleanup: remove retired classes from `theme.css` (target significant line-count reduction).

## Capabilities

### New Capabilities

- `tailwind-shadcn-setup`: Installation and wiring of Tailwind CSS v4 + shadcn/ui in both Electron and web build targets, token mapping, and `components.json` configuration.
- `shadcn-component-migration`: Phased replacement of bespoke UI primitives with shadcn/ui equivalents — menus, modals, drawers, and catalog pass — with dead CSS cleanup.

### Modified Capabilities

- `environment-agent-runtime`: Agent skill configuration changes (swap `@accelint-design-foundation` for `@shadcn` on `frontend-engineer.md`).

## Impact

- **Dependencies**: New direct deps: `tailwindcss`, `@tailwindcss/vite`, `@radix-ui/react-*` (dialog, dropdown-menu, context-menu, popover, sheet, tabs, scroll-area, switch, select, checkbox, tooltip, separator, slot), `class-variance-authority`, `clsx`, `tailwind-merge`. `lucide-react` already present.
- **Build config**: Both `electron.vite.config.ts` and `vite.web.config.ts` gain the Tailwind Vite plugin. New `radix-ui` manual chunk. New `components.json` at repo root.
- **Renderer source**: Every component file in `src/renderer/src/` will be modified (CSS class changes, JSX element swaps). `theme.css` loses significant content. New `src/renderer/src/components/ui/` directory for shadcn components.
- **Documentation**: ARCHITECTURE.md §7 updated. DESIGN.md gains token mapping table. `ob-guardrails-project` gains real content.
- **No IPC changes**: Pure renderer work. No new channels, no main/preload changes.
- **No security boundary changes**: Renderer stays sandboxed. All copy stays through react-intl.
