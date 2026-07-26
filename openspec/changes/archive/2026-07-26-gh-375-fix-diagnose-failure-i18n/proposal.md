# Proposal: Fix diagnoseFailure mixed i18n keys and raw strings

**Change ID:** gh-375-fix-diagnose-failure-i18n
**Issue:** #375
**Scope:** focused

## Problem

`diagnoseFailure()` returns `FailureDiagnosis` with `summary`/`nextStep` fields containing either i18n keys (pattern-match path) or raw English strings (exit-code and fallback paths). Callers cannot distinguish which format they receive, leading to broken localization.

## Solution

Make `diagnoseFailure()` always return i18n keys in `summary`/`nextStep`. Replace exit-code and fallback raw strings with new i18n keys using interpolation params (`exitCode`, `command`). Remove the `formatText` heuristic in `FailureDiagnosisPanel.tsx` and call `t()` unconditionally.

## Files

- `src/renderer/src/chat/diagnoseFailure.ts` — exit-code and fallback paths use i18n keys
- `src/renderer/src/chat/types.ts` — no type change needed (summary/nextStep remain string, now always i18n keys)
- `src/renderer/src/components/FailureDiagnosisPanel.tsx` — remove formatText, call t() directly
- `src/renderer/src/i18n/en.json` — add new i18n keys for exit-code and fallback diagnoses

## Acceptance Criteria

1. Every code path in `diagnoseFailure()` returns i18n keys in `summary` and `nextStep`.
2. `FailureDiagnosisPanel` calls `t(row.summary)` and `t(row.nextStep)` unconditionally.
3. `formatText` heuristic removed.
4. New i18n keys in `en.json` with interpolation for `exitCode` and `command`.
5. `pnpm typecheck`, `pnpm test`, `pnpm build` all pass.
6. Comment ratio under 10% per file.
