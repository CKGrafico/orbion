# Sidebar redesign (refined): 2-level tree Project(instance) > Loop with search and toolbar

## Summary

Collapses the 3-level tree (Instance > Project > Loop) into a 2-level tree (Project(instance) > Loop) for less nesting and faster scanning. Replaces the dropdown instance filter with free-text search. Adds a toolbar with sort, connect instance, and new project buttons.

## Motivation

The previous 3-level tree required users to expand instances first to see projects, then expand projects to see loops. This created unnecessary nesting, especially for users with a single instance. The flattened model makes projects the primary navigation unit, with the instance shown as a badge rather than a tree level.

## Key Changes

1. **Flatten tree to 2 levels**: Project(instance) > Loop
2. **Replace dropdown filter with text search**: Filters project+loop nodes by text (project names, loop descriptions, instance names)
3. **Add toolbar**: Sort (stub), Connect instance (replaces +), New project (stub)
4. **Project node design**: Color dot + project name + instance badge (suppressed when single env) + loop count pill
5. **Loop node design**: Status dot + description + fleet status label + run count
6. **Single-instance UX**: Instance badge hidden when only one environment exists

## Files Changed

- `src/renderer/src/components/Sidebar.tsx` — Complete rewrite: 2-level tree, search, toolbar, node rendering
- `src/renderer/src/App.tsx` — Simplified Sidebar props (removed unused callbacks and data)
- `src/renderer/src/theme.css` — New search input, toolbar, instance badge, loop status/runcount styles
- `src/renderer/src/i18n/en.json` — New i18n keys for search, toolbar, empty states

## Open Questions (deferred)

- Instance detail page access: instances are no longer top-level nodes
- Sort button behavior: by name/instance/status
- Empty projects visibility
- Auto-expand behavior
