## Context

Orbion's renderer (`src/renderer/src/`) uses plain CSS custom properties defined in an 8746-line `theme.css`. There is no component library, no utility framework, and no shared primitive layer. Every modal, menu, drawer, popover, and input is hand-rolled with duplicated CSS patterns. The app builds twice: once as an Electron renderer (`electron.vite.config.ts`), once as a browser-only dev server (`vite.web.config.ts`). Both targets must compile after every change.

The current `DESIGN.md` codifies a dark, terminal-adjacent look: layered navy panels (`#0d141f` → `#1e2839`), hairline borders (`#2a3a54`), a single lime-green accent (`#9fef00` / `#a9d95c`), monospace code surfaces, and intentionally minimal motion. All of this must survive the migration intact.

The `frontend-engineer` agent currently loads `@accelint-design-foundation` (built around non-Tailwind token conventions) and will need to swap it for `@shadcn`.

The `ob-guardrails-project` skill is a placeholder (no real rules yet). Guardrails establishing a shadcn-first policy must be created as part of this change.

## Goals / Non-Goals

**Goals:**

- Install Tailwind CSS v4 and shadcn/ui so both `electron-vite` and `vite.web` build targets compile.
- Map Orbion design tokens to shadcn CSS variables so the dark navy/lime palette is the default (no light-mode regression).
- Replace all bespoke UI primitives with shadcn components in a phased, build-green-at-every-step approach.
- Establish shadcn/ui as the first-choice component library in project guardrails.
- Reduce `theme.css` line count by removing dead CSS after migration.

**Non-Goals:**

- Touching the main process, preload, or IPC contract.
- Adding state management, routing, or a test framework.
- Modifying the `docs/` subproject (it has its own Fumadocs + Tailwind stack).
- Adding new i18n locales or changing the i18n system.
- Migrating the log viewer's highlight.js syntax CSS.
- Adding CI/CD, lint, or packaging configuration.

## Decisions

### D1: Tailwind CSS v4 (not v3)

Tailwind v4 uses the `@tailwindcss/vite` Vite plugin natively — no `tailwind.config.js`. Configuration lives in CSS via `@import "tailwindcss"` and `@theme` blocks. This is simpler to wire into electron-vite than v3's PostCSS pipeline.

**Rationale:** electron-vite 4 uses Vite 7. The `@tailwindcss/vite` plugin is a standard Vite plugin that goes into `renderer.plugins[]`. No PostCSS config, no `tailwind.config.js` file to maintain separately. The CSS-first configuration model also makes it easier to map Orbion's existing `:root` variables inline.

**Alternative:** Tailwind v3 with `tailwind.config.js` + PostCSS. More configuration files, less idiomatic under Vite 7. Rejected.

### D2: shadcn/ui "new-york" style

The "new-york" variant is the densest shadcn style, closest to Orbion's terminal-aesthetic information density.

**Rationale:** "default" style has more padding/roundedness; "new-york" uses smaller radii and tighter spacing, matching Orbion's `radius-sm: 7px` and compact 14px base size. The visual gap between shadcn defaults and Orbion's custom design is smallest with new-york.

### D3: Orbion tokens → shadcn CSS variables mapping

shadcn/ui reads theming from CSS variables (`--background`, `--foreground`, `--primary`, `--card`, etc.) defined under `:root`. Orbion's existing `:root` variables will be extended to include the shadcn variable names, mapped to the same color values.

Key mapping:

| Orbion token | shadcn variable | Value |
|---|---|---|
| `--bg-panel` | `--background` | `#141d2b` |
| `--text-primary` | `--foreground` | `#e8edf6` |
| `--bg-elevated` | `--card` | `#18222f` |
| `--bg-elevated` | `--popover` | `#18222f` |
| `--accent` | `--primary` | `#a9d95c` |
| `--accent-ink` | `--primary-foreground` | `#0d141f` |
| `--bg-input` | `--secondary` | `#0f1826` |
| `--text-secondary` | `--secondary-foreground` | `#a4b1cd` |
| `--bg-hover` | `--muted` | `#202c40` |
| `--text-muted` | `--muted-foreground` | `#64718c` |
| `--border` | `--border` | `#2a3a54` |
| `--bg-input` | `--input` | `#0f1826` |
| `--border-subtle` | `--ring` | `#1f2b3d` |
| `--danger` | `--destructive` | `#ff8484` |
| `--accent-hover` | `--accent` | `#bce47c` |

Radii will use Orbion's custom scale (`--radius-sm: 7px` etc.) mapped to shadcn's `--radius` variable.

**Rationale:** This makes Orbion's dark theme the default — shadcn components render with the navy/lime palette without any theme toggle. The `data-theme="light"` section in `theme.css` will map the same shadcn variables to light-mode values.

### D4: ContextMenu for right-click, DropdownMenu for three-dot

The sidebar's per-session menu has two trigger patterns: right-click (native) and three-dot button click. `ContextMenu` handles the right-click case semantically; `DropdownMenu` handles the button-click case. Both will be installed and used where appropriate. For simplicity and because the current implementation uses a positioned overlay with JS click handling (not native `onContextMenu`), `DropdownMenu` is the primary choice for both triggers. If the UX team later wants native right-click semantics, `ContextMenu` is a one-line prop swap.

**Rationale:** Using `DropdownMenu` for both avoids complexity. Radix's `DropdownMenu` already handles positioning, focus management, and keyboard navigation. The current custom menu uses manual `left/top` positioning which `DropdownMenu` replaces entirely.

### D5: Phased migration (6 tasks)

Each phase keeps the build green. The app looks identical at the end of Task 0 (setup); components swap one tier at a time.

- Task 0: Setup (Tailwind + shadcn init + token mapping + guardrails + skills)
- Task 1: Menus (P0 acceptance gate)
- Task 2: Modals
- Task 3: Drawers
- Task 4: Catalog pass
- Task 5: Dead CSS cleanup

**Rationale:** Bigr-bang migration would break typecheck for days. Phasing with a P0 menu gate ensures the acceptance criterion is met early and the app stays shippable between tiers.

### D6: CSS entry point strategy

Create `src/renderer/src/globals.css` with `@import "tailwindcss"` and the `@theme` block mapping Orbion tokens to shadcn variables. Import it from `main.tsx` alongside the existing `theme.css` import. During the migration, `theme.css` continues to provide component-specific CSS classes that haven't been migrated yet. After Task 5 (cleanup), `theme.css` shrinks to only the classes that Tailwind cannot replace (log viewer syntax highlighting, third-party widget theming, layout glue).

**Rationale:** Keeps the migration incremental. No big-bang CSS rewrite. Both old and new styling coexist until dead CSS is cleaned up.

## Risks / Trade-offs

- **Tailwind v4 + electron-vite 4 compatibility** → Not yet validated in this repo. Mitigation: Task 0 explicitly verifies both build targets compile. If `@tailwindcss/vite` fails under electron-vite, fallback to Tailwind v3 with PostCSS plugin.
- **Visual regression from shadcn defaults** → shadcn defaults to light-mode, neutral palette. Mitigation: token mapping is done in Task 0 before any component swap. Orbion's navy/lime becomes the `:root` default.
- **Two build targets diverging** → Mitigation: Task 0 wires the plugin into both configs and verifies `dev:web` explicitly.
- **Scope of Task 4 (catalog pass)** → ~30 component files is large. Mitigation: can be split into parallel waves by file group (inbox, review, chat, loop cards, settings). Each wave is independently verifiable.
- **`@accelint-design-foundation` skill conflict** → Remaining loaded during migration would contradict shadcn guidance. Mitigation: swap happens in Task 0 before any component work.
- **No automated visual regression testing** → Verification relies on typecheck + manual visual checks + `dev:web` browser mode. Mitigation: `rtk pnpm typecheck` is the gate; visual identity is enforced through the token mapping contract.
