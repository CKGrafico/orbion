# Use react-i18next

## Summary

Replace the mixed react-intl + standaloneIntl i18n setup with a single react-i18next implementation across the renderer.

## Motivation

Two i18n APIs coexist: `useIntl`/`formatMessage` from react-intl in 49+ component files, and `standaloneIntl` (a react-intl `IntlShape`) in 3 non-component modules. Developers must reason about two patterns. Migrating to react-i18next unifies around `useTranslation`/`t()` for components and `i18next.t()` for standalone usage — one library, one API.

## Scope

Renderer-side only. The main process `src/main/i18n.ts` (`msg()` helper returning `I18nMessage`) is a pure IPC contract and does NOT change.

## Design

### i18n setup (`src/renderer/src/i18n/index.ts`)

- Initialize `i18next` with `initReactI18next` plugin and the existing `en.json` as the `translation` namespace.
- i18next natively supports nested JSON keys via dot-path resolution (`app.brand` → `t("app.brand")`), so the `flattenMessages` helper is removed.
- Export `i18n` instance for standalone usage and `defaultLocale`.
- `translateMessage` helper updates: resolve `I18nMessage` keys via `i18n.t()`.

### Provider (`src/renderer/src/main.tsx`)

- Replace `IntlProvider` with `I18nextProvider` (or simply rely on `i18next.use(initReactI18next)` which auto-provides context — no explicit provider needed).
- Remove `messages` import.

### Component files (~49 files)

- `import { useIntl } from "react-intl"` → `import { useTranslation } from "react-i18next"`
- `const intl = useIntl()` → `const { t } = useTranslation()`
- `intl.formatMessage({ id: "key" })` → `t("key")`
- `intl.formatMessage({ id: "key" }, params)` → `t("key", params)`
- Remove `IntlShape` type imports.

### Standalone files (format.ts, fleet-status.ts, runtime-health.ts)

- `import { standaloneIntl } from "./i18n"` → `import i18n from "./i18n"`
- `standaloneIntl.formatMessage({ id: "key" })` → `i18n.t("key")`
- `standaloneIntl.formatMessage({ id: "key" }, params)` → `i18n.t("key", params)`
- `format.ts`: Remove `IntlShape` type import from react-intl. `healthTooltip` accepts the `t` function instead of `IntlShape`, or uses `i18n.t()` directly.

### ICU plural syntax migration

react-intl uses `{count, plural, one {} other {}}` inline in message strings. react-i18next supports `count` interpolation (`{count}`) and relies on plural suffix keys (`key_one`, `key_other`) for proper pluralization. However, since all current plurals are English-only and the ICU syntax appears only in a handful of `en.json` entries, the approach is:

1. For messages with `{count, plural, one {X} other {Y}}` syntax: split into `_one` and `_other` keys under the same parent.
2. For messages with `{count, select, ...}` syntax: split similarly with `_0`, `_1` suffixes or inline replacement.
3. Messages that only use `{variable}` interpolation (no plurals/selects): no change needed — i18next handles this natively.

### Build config

- Remove `if (id.includes("react-intl")) return "intl"` from `electron.vite.config.ts` manual chunks.

### Package changes

- Remove `react-intl` from `package.json` dependencies.
- Add `i18next` and `react-i18next` to dependencies.

### Guardrails update

- `GR-STYLE-005` in `ob-guardrails-project/SKILL.md`: "User-facing copy through react-intl" → "User-facing copy through react-i18next" with `useTranslation` hook reference.

### Config context

- `openspec/config.yaml` line 10-11: "react-intl i18n" → "react-i18next i18n".

## Affected Files

| Layer | Files |
|-------|-------|
| i18n setup | `src/renderer/src/i18n/index.ts`, `src/renderer/src/i18n/en.json` |
| Provider | `src/renderer/src/main.tsx` |
| Build | `electron.vite.config.ts` |
| Package | `package.json` |
| Guardrails | `.agents/skills/ob-guardrails-project/SKILL.md` |
| Config | `openspec/config.yaml` |
| Components (useIntl) | ~49 files in `src/renderer/src/components/`, `src/renderer/src/chat/`, `src/renderer/src/features/`, `src/renderer/src/App.tsx` |
| Standalone | `src/renderer/src/format.ts`, `src/renderer/src/fleet-status.ts`, `src/renderer/src/runtime-health.ts` |

## Out of Scope

- `src/main/i18n.ts` — pure IPC contract, no react-intl dependency.
- Adding new languages or locale switching.
- Changing any user-facing string content.
