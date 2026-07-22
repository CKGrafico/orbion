## 0. Setup: Tailwind + shadcn + Guardrails + Skills

- [ ] 0.1 Install Tailwind CSS v4, `@tailwindcss/vite`, `class-variance-authority`, `clsx`, `tailwind-merge` as dependencies via `rtk pnpm add` <!-- agent: frontend-engineer.build, depends_on: [], touches: [package.json, pnpm-lock.yaml] -->
- [ ] 0.2 Wire `@tailwindcss/vite` plugin into `electron.vite.config.ts` (renderer.plugins) and `vite.web.config.ts` (plugins) <!-- agent: frontend-engineer.build, depends_on: [0.1], touches: [electron.vite.config.ts, vite.web.config.ts] -->
- [ ] 0.3 Create `src/renderer/src/globals.css` with `@import "tailwindcss"`, `@theme` block, and Orbion→shadcn CSS variable mapping under `:root`; import it from `main.tsx` <!-- agent: frontend-engineer.build, depends_on: [0.2], touches: [src/renderer/src/globals.css, src/renderer/src/main.tsx] -->
- [ ] 0.4 Run `npx shadcn@latest init` with new-york style, CSS variables enabled, `components.json` at repo root, component output `src/renderer/src/components/ui` <!-- agent: frontend-engineer.build, depends_on: [0.3], touches: [components.json, src/renderer/src/lib/utils.ts, src/renderer/src/components/ui/**] -->
- [ ] 0.5 Add `radix-ui` manual chunk to `electron.vite.config.ts` renderer build rollupOptions <!-- agent: frontend-engineer.fast, depends_on: [0.4], touches: [electron.vite.config.ts] -->
- [ ] 0.6 Update `ob-guardrails-project` SKILL.md with GR-STYLE-004 (shadcn-first policy), GR-DEP-002 (Tailwind + shadcn approved exception), GR-STYLE-001 (shadcn skill reference) <!-- agent: frontend-engineer.fast, depends_on: [], touches: [.agents/skills/ob-guardrails-project/SKILL.md] -->
- [ ] 0.7 Update `frontend-engineer.md` Abilities: remove `@accelint-design-foundation`, add `@shadcn` <!-- agent: frontend-engineer.fast, depends_on: [], touches: [.opencode/agents/frontend-engineer.md] -->
- [ ] 0.8 Update ARCHITECTURE.md §7 styling row from "Plain CSS + custom properties" to "Tailwind CSS v4 + shadcn/ui on top of Orbion design-token CSS variables" <!-- agent: frontend-engineer.fast, depends_on: [], touches: [ARCHITECTURE.md] -->
- [ ] 0.9 Update DESIGN.md: add Orbion token → shadcn variable mapping table <!-- agent: frontend-engineer.fast, depends_on: [0.3], touches: [DESIGN.md] -->
- [ ] 0.10 Verify: `rtk pnpm typecheck` passes, `rtk pnpm dev:web` loads with no console errors, app renders identically <!-- agent: frontend-engineer.fast, depends_on: [0.5, 0.6, 0.7, 0.8, 0.9], touches: [] -->

## 1. Menus (P0 Acceptance Gate)

- [ ] 1.1 Add shadcn `dropdown-menu` and `context-menu` components via `npx shadcn@latest add dropdown-menu context-menu` <!-- agent: frontend-engineer.build, depends_on: [0.10], touches: [src/renderer/src/components/ui/dropdown-menu.tsx, src/renderer/src/components/ui/context-menu.tsx] -->
- [ ] 1.2 Migrate Sidebar context menu to `DropdownMenu` (items: pin/unpin, rename, delete, move up/down, move to project submenu); remove custom `sidebar-context-menu` + `sidebar-context-menu-backdrop` JSX and CSS <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/components/Sidebar.tsx] -->
- [ ] 1.3 Add shadcn `popover` component via `npx shadcn@latest add popover`; migrate FleetActivityReadout to `Popover`; remove `fleet-activity-popover*` JSX and CSS <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/components/ui/popover.tsx, src/renderer/src/components/FleetActivityReadout.tsx] -->
- [ ] 1.4 Verify: `rtk pnpm typecheck` passes, sidebar menu opens/closes with keyboard, popover works <!-- agent: frontend-engineer.fast, depends_on: [1.2, 1.3], touches: [] -->

## 2. Modals / Dialogs

- [ ] 2.1 Add shadcn `dialog` and `alert-dialog` components via `npx shadcn@latest add dialog alert-dialog` <!-- agent: frontend-engineer.build, depends_on: [0.10], touches: [src/renderer/src/components/ui/dialog.tsx, src/renderer/src/components/ui/alert-dialog.tsx] -->
- [ ] 2.2 Migrate App.tsx confirm-remove and confirm-unpersist dialogs to `AlertDialog`; remove `modal-backdrop` + `modal` + `modal-actions` CSS patterns <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/App.tsx] -->
- [ ] 2.3 Migrate AddVmWizard to `Dialog` (wide variant ~860px) <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/components/AddVmWizard.tsx] -->
- [ ] 2.4 Migrate PickMainVmModal to `Dialog`; migrate RestoreOffer to `Dialog` <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/components/PickMainVmModal.tsx, src/renderer/src/components/RestoreOffer.tsx] -->
- [ ] 2.5 Migrate StaleConfigWarning to `AlertDialog` <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/components/StaleConfigWarning.tsx] -->
- [ ] 2.6 Migrate ReviewModeOverlay to `Dialog` (full-screen variant) <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/features/review/ReviewModeOverlay.tsx] -->
- [ ] 2.7 Verify: `rtk pnpm typecheck` passes, all migrated dialogs open/close correctly <!-- agent: frontend-engineer.fast, depends_on: [2.2, 2.3, 2.4, 2.5, 2.6], touches: [] -->

## 3. Drawers / Panels

- [ ] 3.1 Add shadcn `sheet` component via `npx shadcn@latest add sheet` <!-- agent: frontend-engineer.build, depends_on: [0.10], touches: [src/renderer/src/components/ui/sheet.tsx] -->
- [ ] 3.2 Migrate SettingsPanel to `Sheet` side="right"; remove `settings-backdrop` + `settings-drawer` <!-- agent: frontend-engineer.build, depends_on: [3.1], touches: [src/renderer/src/components/SettingsPanel.tsx] -->
- [ ] 3.3 Migrate InstanceSettingsPanel to `Sheet` side="right" <!-- agent: frontend-engineer.build, depends_on: [3.1], touches: [src/renderer/src/components/InstanceSettingsPanel.tsx] -->
- [ ] 3.4 Migrate BudgetWatchPanel to `Sheet` or `Dialog` as appropriate <!-- agent: frontend-engineer.build, depends_on: [3.1], touches: [src/renderer/src/components/BudgetWatchPanel.tsx] -->
- [ ] 3.5 Verify: `rtk pnpm typecheck` passes, all drawers open/close from sidebar <!-- agent: frontend-engineer.fast, depends_on: [3.2, 3.3, 3.4], touches: [] -->

## 4. Catalog Pass (Primitives)

- [ ] 4.1 Add shadcn `button`, `input`, `card`, `badge`, `separator`, `tabs`, `tooltip`, `scroll-area`, `checkbox`, `switch`, `select` via `npx shadcn@latest add button input card badge separator tabs tooltip scroll-area checkbox switch select` <!-- agent: frontend-engineer.build, depends_on: [0.10], touches: [src/renderer/src/components/ui/*.tsx] -->
- [ ] 4.2 Replace plain `<button>` elements across remaining components with `<Button>` from shadcn <!-- agent: frontend-engineer.build, depends_on: [4.1], touches: [src/renderer/src/components/*.tsx, src/renderer/src/App.tsx] -->
- [ ] 4.3 Replace plain `<input>` elements with `<Input>` from shadcn <!-- agent: frontend-engineer.build, depends_on: [4.1], touches: [src/renderer/src/components/*.tsx] -->
- [ ] 4.4 Replace other primitives (Card, Badge, Tabs, Tooltip, ScrollArea, Checkbox, Switch, Select, Separator) where appropriate across remaining components <!-- agent: frontend-engineer.build, depends_on: [4.1], touches: [src/renderer/src/components/*.tsx, src/renderer/src/features/**/*.tsx] -->
- [ ] 4.5 Verify: `rtk pnpm typecheck` passes, all component files compile <!-- agent: frontend-engineer.fast, depends_on: [4.2, 4.3, 4.4], touches: [] -->

## 5. Dead CSS Cleanup

- [ ] 5.1 Remove retired CSS classes from `theme.css`: `modal-backdrop`, `modal`, `modal-actions`, `settings-backdrop`, `settings-drawer`, `sidebar-context-menu`, `sidebar-context-menu-backdrop`, `fleet-activity-popover*`, `stale-config-modal`, `budget-panel-backdrop`, `review-mode-overlay*`, and any classes now provided by shadcn components <!-- agent: frontend-engineer.build, depends_on: [1.4, 2.7, 3.5, 4.5], touches: [src/renderer/src/theme.css] -->
- [ ] 5.2 Verify and report final `theme.css` line count; confirm substantial reduction from 8746-line baseline <!-- agent: frontend-engineer.fast, depends_on: [5.1], touches: [] -->
- [ ] 5.3 Final verification: `rtk pnpm typecheck` passes, `rtk pnpm dev:web` loads with no console errors, visual spot-check of main views <!-- agent: frontend-engineer.fast, depends_on: [5.2], touches: [] -->
