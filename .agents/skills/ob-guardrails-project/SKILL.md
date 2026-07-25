---
name: ob-guardrails-project
description: Project-specific guardrails extracted from ARCHITECTURE.md and project config files. Load this skill before implementing any change to understand boundaries, conventions, and constraints for this codebase.
license: MIT
---

# Orbion — Project Guardrails

## Styling (GR-STYLE)

### GR-STYLE-001: shadcn/ui is the primary component library
shadcn/ui is the primary component library. Tailwind CSS v4 is the utility layer that backs it. New UI MUST first be built from a `npx shadcn@latest add <component>` primitive; only build a custom component when no shadcn primitive fits the need, and document why in the component's header comment.

### GR-STYLE-002: shadcn-first rule
Before writing a new React component that renders a UI primitive (button, input, modal, dropdown, tooltip, tabs, sheet, popover, card, badge, select, checkbox, switch, separator, scroll-area, dialog, alert-dialog, context-menu), the engineer MUST first check whether `npx shadcn@latest add <name>` provides it. If it does, install and use it. If it does not, open an `ob-plan-explore` note documenting the gap before building custom.

### GR-STYLE-003: Plain CSS is restricted
Plain CSS remains valid only for: layout glue that Tailwind cannot express, third-party widget theming, and the log viewer's syntax-highlighting CSS. Do not write plain CSS for patterns that shadcn/ui or Tailwind utilities provide.

### GR-STYLE-004: No other CSS frameworks
Do not introduce CSS-in-JS, styled-components, or another CSS framework without explicit team alignment and an approved architecture change. Tailwind CSS v4 + shadcn/ui are the approved styling stack.

### GR-STYLE-005: User-facing copy through react-intl
All user-facing copy MUST flow through react-intl keys. shadcn components receive `intl.formatMessage` results as `children` or `label` props, not hardcoded strings.

## Dependencies (GR-DEP)

### GR-DEP-001: Strict TypeScript
No `any` types. `strict: true` in tsconfig. All code must pass `pnpm typecheck`.

### GR-DEP-002: New framework introduction
Do not introduce a new framework, state-management system, persistence layer, or CSS framework without explicit team alignment.

**Approved framework addition:** Tailwind CSS v4 and shadcn/ui are approved. The approval is recorded in this skill and in the OpenSpec change that shipped it. All other framework-introduction rules remain.

## Architecture (GR-ARCH)

### GR-ARCH-001: Electron process boundaries
Network I/O belongs in the main process. The renderer only calls `window.api`. Call out any new IPC channel explicitly.

### GR-ARCH-002: No router
The `view` discriminated union handles routing. Do not introduce react-router or similar.

### GR-ARCH-003: No state library
Local component state + `useInject` handles state. Do not introduce Redux, Zustand, Jotai, or similar.

### GR-ARCH-004: ESM only
Use ES module imports. No `require()` or CommonJS in renderer code.

## Security (GR-SEC)

### GR-SEC-001: Renderer sandboxing
`contextIsolation: true`, `nodeIntegration: false` are unchanged. The renderer must never have direct Node or network access.

### GR-SEC-002: IPC surface
All IPC channels are defined in `src/shared/ipc.ts`. Do not add channels without updating the shared contract.

### GR-SEC-003: Markdown sanitization
All markdown rendered via `react-markdown` MUST pass through `rehype-sanitize`.

## Build (GR-BUILD)

### GR-BUILD-001: Both targets must compile
Changes must compile under both `electron.vite.config.ts` and `vite.web.config.ts`. Run `pnpm typecheck` and `pnpm check:comments` before marking done.

### GR-BUILD-002: Prefix CLI commands with `rtk`
All shell commands must be prefixed with `rtk` (e.g. `rtk pnpm test`, `rtk git diff`).

### GR-BUILD-003: Radix UI chunk
Radix UI primitives MUST be grouped in the `radix-ui` manual chunk in `electron.vite.config.ts`.

## Code Quality (GR-CODE)

### GR-CODE-001: Comment ratio must stay under 10%
**Definition:** Comment ratio = `(comment_lines / non_blank_lines) * 100` per file.

**What counts as a comment line:** Lines starting with `//`, `/*`, `*/`, or `* ` (JSDoc inner lines). All comment types count — no exemptions for JSDoc/TSDoc.

**Enforcement:** `pnpm check:comments` fails the build when any file exceeds 10%. This is a hard gate.

**Scope:** All `src/**/*.ts` and `src/**/*.tsx` files. Test files (`tests/**/*.test.ts`) are exempt.

**What to preserve:** Only "why" comments — workarounds, platform quirks, references to issues/specs, non-obvious constraints.

**What to remove:** Comments that restate what the code does, JSDoc that restates type information from signatures, section dividers, step-number comments.
