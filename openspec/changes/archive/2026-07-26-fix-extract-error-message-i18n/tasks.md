# Tasks: fix-extract-error-message-i18n

## T1: Fix extractErrorMessage to use translateMessage

- **Agent:** fullstack-engineer
- **Tier:** fast
- **Depends on:** —
- **Touches:** `src/renderer/src/runtime-health.ts`
- **Description:** Import `translateMessage` from `./i18n`; replace `return msg.key` with `return translateMessage(msg)`; adjust return type so empty string from `translateMessage(null)` maps to `null`.
- **Acceptance:**
  - `extractErrorMessage` returns translated string for `I18nMessage` input
  - `extractErrorMessage` returns string as-is for plain string input
  - `extractErrorMessage` returns `null` for null/undefined input
  - `pnpm typecheck` passes
  - `pnpm test` passes
  - `pnpm build` passes
