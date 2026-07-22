## ADDED Requirements

### Requirement: Tailwind CSS v4 installed and wired into both build targets
The system SHALL have Tailwind CSS v4 with `@tailwindcss/vite` plugin configured in both `electron.vite.config.ts` (renderer.plugins) and `vite.web.config.ts` (plugins).

#### Scenario: Electron renderer build includes Tailwind
- **WHEN** `rtk pnpm build` runs
- **THEN** the Electron renderer bundle includes compiled Tailwind utilities and no build errors occur

#### Scenario: Web dev server includes Tailwind
- **WHEN** `rtk pnpm dev:web` runs
- **THEN** the browser renders the mock-mode application with Tailwind utilities applied and no console errors

### Requirement: shadcn/ui initialized with project configuration
The system SHALL have a `components.json` file at the repository root configuring shadcn/ui with new-york style, CSS variables enabled, and component output path pointing to `src/renderer/src/components/ui`.

#### Scenario: shadcn component can be added
- **WHEN** `npx shadcn@latest add button` runs
- **THEN** a `button.tsx` file is created in `src/renderer/src/components/ui/` with proper imports from `@/lib/utils`

### Requirement: Orbion design tokens mapped to shadcn CSS variables
The system SHALL define shadcn CSS variables (`--background`, `--foreground`, `--primary`, `--card`, `--popover`, `--muted`, `--border`, `--input`, `--ring`, `--destructive`, `--accent`) under `:root` in the renderer's CSS entry, mapped to Orbion's existing navy/lime palette values so that shadcn components render in the dark theme by default.

#### Scenario: shadcn Button renders with Orbion accent
- **WHEN** a `<Button variant="default">` is rendered in the Electron app
- **THEN** its background color is the Orbion accent lime green (`#a9d95c`) and its text color is the Orbion accent-ink dark navy (`#0d141f`)

#### Scenario: shadcn Card renders with Orbion panel background
- **WHEN** a `<Card>` is rendered in the Electron app
- **THEN** its background color is the Orbion elevated surface (`#18222f`) and its border color is the Orbion hairline border (`#2a3a54`)

### Requirement: Radix UI chunk configured for Electron production build
The `electron.vite.config.ts` renderer build SHALL include a `radix-ui` manual chunk grouping all `@radix-ui/react-*` imports for optimal bundle splitting.

#### Scenario: Radix primitives are chunked separately
- **WHEN** `rtk pnpm build` runs
- **THEN** the `out/renderer/` directory contains a `radix-ui-[hash].js` chunk file

### Requirement: Both build targets compile after setup
After setup, `rtk pnpm typecheck` SHALL pass for both `tsconfig.web.json` and `tsconfig.node.json`, and `rtk pnpm dev:web` SHALL load the mock-mode renderer with no console errors.

#### Scenario: typecheck passes
- **WHEN** `rtk pnpm typecheck` runs
- **THEN** both `tsc --noEmit -p tsconfig.node.json` and `tsc --noEmit -p tsconfig.web.json` exit with code 0

#### Scenario: dev:web loads without errors
- **WHEN** `rtk pnpm dev:web` starts and the browser loads the app
- **THEN** no JavaScript errors appear in the browser console and the app renders the same UI as before the setup
