# Tasks

## Task 1: Add new i18n keys to en.json
- **Tier:** fast
- **Agent:** general
- **Depends on:** none
- **Touches:** `src/renderer/src/i18n/en.json`
- **Done when:** All 14 new keys added under `"diagnosis"` section with correct interpolation params.

## Task 2: Update FailureDiagnosis type and diagnoseFailure function
- **Tier:** build
- **Agent:** frontend-engineer
- **Depends on:** Task 1
- **Touches:** `src/renderer/src/chat/diagnoseFailure.ts`
- **Done when:**
  - `FailureDiagnosis` interface has optional `params` field.
  - `diagnoseFromExitCode` returns i18n keys with `params` instead of raw strings.
  - Fallback paths return i18n keys with `params` instead of raw strings.
  - Non-failed path returns i18n keys.
  - Comment ratio stays under 10%.
  - No `any` types.

## Task 3: Update FailureDiagnosisRow type and panel consumer
- **Tier:** build
- **Agent:** frontend-engineer
- **Depends on:** Task 2
- **Touches:** `src/renderer/src/chat/types.ts`, `src/renderer/src/components/FailureDiagnosisPanel.tsx`, `src/renderer/src/components/SessionChatView.tsx`
- **Done when:**
  - `FailureDiagnosisRow` has optional `params` field.
  - `FailureDiagnosisPanel` removes `formatText`, calls `t(row.summary, row.params)` and `t(row.nextStep, row.params)`.
  - `SessionChatView` passes `params` through to `insertFailureDiagnosis`.
  - Comment ratio stays under 10%.
  - No `any` types.

## Task 4: Verify — typecheck, test, build
- **Tier:** fast
- **Agent:** general
- **Depends on:** Task 3
- **Touches:** none (verification only)
- **Done when:** `rtk proxy pnpm typecheck`, `rtk proxy pnpm test`, `rtk proxy pnpm build` all pass.
