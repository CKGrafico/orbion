# Archive — Use react-i18next

## Summary

Replaced the react-intl i18n setup with react-i18next across the renderer. All 50+ component files and 3 standalone modules migrated. react-intl removed from dependencies.

## Completed Tasks

1. **i18n setup** — Replaced `src/renderer/src/i18n/index.ts` with i18next init using `initReactI18next`. Removed `flattenMessages` and `standaloneIntl`. Export `i18n` instance, `defaultLocale`, `translateMessage`.
2. **ICU plural/select conversion** — Converted all ICU plural/select syntax in `en.json` to i18next `_one`/`_other` plural keys. Changed interpolation from `{var}` to `{{var}}`.
3. **Provider update** — Removed `IntlProvider` from `main.tsx`. i18next auto-provides context via `initReactI18next`.
4. **Component migration** — All 49+ component files: `useIntl` → `useTranslation`, `intl.formatMessage({ id: ... })` → `t(...)`.
5. **Standalone migration** — `format.ts`, `fleet-status.ts`, `runtime-health.ts`, `use-notifications.ts`: `standaloneIntl.formatMessage(...)` → `i18n.t(...)`.
6. **Build and guardrails** — Removed react-intl manual chunk from `electron.vite.config.ts`. Updated GR-STYLE-005 in guardrails. Updated `openspec/config.yaml`.
7. **Verification** — `pnpm typecheck` passes. `pnpm check:comments` passes. No react-intl imports remain. `node_modules/react-intl` absent.

## Acceptance Criteria Status

- ✅ Core i18n setup migrated — I18nextProvider via initReactI18next
- ✅ All useIntl hooks replaced — no react-intl imports in renderer
- ✅ Standalone intl usage replaced — i18next.t() in format.ts, fleet-status.ts, runtime-health.ts
- ✅ Message format converted — en.json uses i18next {{var}} interpolation and _one/_other plurals
- ✅ react-intl fully removed — not in package.json, not in node_modules
- ✅ Build config updated — react-intl manual chunk removed
- ✅ Guardrails updated — GR-STYLE-005 references react-i18next

## Edge Cases Addressed

- ICU plural syntax: Converted to i18next _one/_other keys
- `{label, select, ...}` in stackTitle and breachNotification: Converted to contextual keys and suffix patterns
- Standalone usage outside React: Uses `i18n.t()` directly
- Main process i18n: Unchanged (pure IPC contract)
- Duplicate `session` key in original JSON: Resolved by moving first block's keys to `sessionGeneral`
