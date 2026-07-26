# Proposal: Fix extractErrorMessage returns raw i18n key

## Summary

`extractErrorMessage` in `src/renderer/src/runtime-health.ts` returns `msg.key` (raw i18n key string) instead of the translated message when `msg` is an `I18nMessage`. The `translateMessage` utility in `src/renderer/src/i18n/index.ts` already handles `I18nMessage | string | null` correctly — use it.

## Problem

- `RuntimeHealthChip` tooltip shows raw keys like `runtimeHealth.authProblemReason` instead of translated text.
- `I18nMessage.params` is discarded, so parameterized messages are incomplete.

## Fix

1. Import `translateMessage` from `./i18n` in `runtime-health.ts`.
2. Replace `return msg.key` with `return translateMessage(msg)`.
3. Simplify `extractErrorMessage` to delegate entirely to `translateMessage`, returning `""` → `null` for nullish.

## Scope

- `src/renderer/src/runtime-health.ts`: lines 3 (import), 138–142 (function body)
- No other files need changes.

## References

- Issue #374
