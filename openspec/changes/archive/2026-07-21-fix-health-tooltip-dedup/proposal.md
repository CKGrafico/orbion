## Why

The `healthTooltip` function is duplicated identically in `App.tsx` and `Sidebar.tsx`. Any future connection phase or tooltip change requires updating both copies, risking divergence and violating the DRY principle and project guardrail against god-files.

## What Changes

- Extract `healthTooltip` from `App.tsx` and `Sidebar.tsx` into `src/renderer/src/format.ts` (the existing formatting helpers module per project architecture)
- Unify the `intl` parameter type to `IntlShape` (canonically equivalent to `ReturnType<typeof useIntl>`)
- Remove the now-unused `translateMessage` and `IntlShape` imports from `Sidebar.tsx`

## Capabilities

### New Capabilities

- `health-tooltip`: shared `healthTooltip` function in the format module, mapping `ConnectionStatus.phase` to i18n-formatted tooltip strings

### Modified Capabilities

(none)

## Impact

- `src/renderer/src/format.ts`: new export added (`healthTooltip`), new imports (`IntlShape`, `ConnectionStatus`, `EnvironmentHealth`, `translateMessage`)
- `src/renderer/src/App.tsx`: local `healthTooltip` removed, imports `healthTooltip` from `format.ts`
- `src/renderer/src/components/Sidebar.tsx`: local `healthTooltip` removed, imports `healthTooltip` from `format.ts`, unused `translateMessage` and `IntlShape` imports removed
