---
name: shadcn
description: Official shadcn/ui skill for building React components with Tailwind CSS v4 and Radix UI. Use when adding, modifying, or migrating to shadcn/ui components in the Orbion renderer.
license: MIT
---

# shadcn/ui Skill

Build React UI components using shadcn/ui — accessible primitives backed by Radix UI, styled with Tailwind CSS v4.

## When to use

- Adding a new UI primitive (button, dialog, dropdown, sheet, etc.)
- Migrating an existing custom component to shadcn/ui
- Styling a component with Tailwind utility classes

## Rules

1. **shadcn-first.** Before writing a custom component, check whether `npx shadcn@latest add <name>` provides it. If it does, install and use it. If it does not, document the gap before building custom.

2. **Use `cn()` for class merging.** Import `cn` from `@/lib/utils` to conditionally merge Tailwind classes.

3. **Component files live in `src/renderer/src/components/ui/`.** This is the shadcn output directory configured in `components.json`.

4. **Orbion design tokens are the source of truth.** The shadcn CSS variables in `globals.css` are mapped to Orbion's navy/lime palette. Do not override these values inline. Use the semantic variables (`bg-background`, `text-foreground`, `bg-primary`, etc.) or Tailwind utilities that resolve to them.

5. **All user-facing copy through react-i18next.** shadcn components receive `t()` results as `children` or `label` props, not hardcoded strings (GR-STYLE-005).

6. **Use "new-york" style conventions.** The project uses the new-york variant. When adding or customizing components, follow its density and spacing patterns.

7. **Do not modify `components.json` without team alignment.** The shadcn configuration is project-level infrastructure.

## Common commands

```bash
# Add a single component
npx shadcn@latest add <component-name>

# Add multiple components
npx shadcn@latest add button dialog alert-dialog sheet dropdown-menu context-menu popover

# List available components
npx shadcn@latest list
```

## Component catalog

Most commonly needed in Orbion:
- `button` — primary, secondary, destructive, ghost, outline variants
- `input` — form text inputs
- `dialog` / `alert-dialog` — modals and confirmations
- `sheet` — side drawers
- `dropdown-menu` / `context-menu` — menus
- `popover` — floating info panels
- `card` — content containers
- `badge` — status chips
- `tabs` — section switching
- `tooltip` — hover info
- `scroll-area` — scrollable containers
- `checkbox` / `switch` / `select` — form controls
- `separator` — visual dividers

## Integration notes

- Radix UI primitives are grouped in the `radix-ui` manual chunk in `electron.vite.config.ts`.
- Both `electron.vite.config.ts` and `vite.web.config.ts` have the `@tailwindcss/vite` plugin.
- The `@/` path alias resolves to `src/renderer/src/`.
