## Context

`healthTooltip` is a pure function mapping `ConnectionStatus.phase` to an i18n-formatted string, duplicated in `App.tsx` (line 71) and `Sidebar.tsx` (line 28). The two copies differ only in the `intl` parameter type annotation (`ReturnType<typeof useIntl>` vs `IntlShape`), which are functionally equivalent since `useIntl` returns `IntlShape`. The project architecture already designates `format.ts` as the home for formatting helpers.

## Goals / Non-Goals

**Goals:**
- Single source of truth for `healthTooltip` in `format.ts`
- Both `App.tsx` and `Sidebar.tsx` import from the shared location
- No behavioral change

**Non-Goals:**
- Refactoring the `phaseToHealth` helper (out of scope)
- Changing i18n keys or message structure

## Decisions

1. **Place in `format.ts`** per project guardrail: "Formatting helpers are pure functions in `src/renderer/src/format.ts`." This is the canonical location.

2. **Use `IntlShape` as the parameter type** over `ReturnType<typeof useIntl>`. `IntlShape` is the concrete type from react-intl; `ReturnType<typeof useIntl>` resolves to the same thing but adds indirection. `IntlShape` matches Sidebar.tsx's original annotation.

3. **Import `translateMessage` from `i18n` in `format.ts`** rather than duplicating error-translation logic. `format.ts` already imports from `i18n` (`standaloneIntl`), so this adds no new coupling.

## Risks / Trade-offs

- [Circular import risk with i18n] `format.ts` already imports `standaloneIntl` from `i18n/index.ts`, and `i18n/index.ts` does not import from `format.ts`, so no cycle. `translateMessage` is a pure function with no side effects.
- [Behavioral change] None: the extracted function is character-for-character identical to the Sidebar.tsx version.
