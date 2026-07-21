# gh-315: handleConfigError missing logService argument in updateFn

## Summary

`handleConfigError(logService, operation, error)` called without `logService` in the `updateFn` callback (line 109 of `src/renderer/src/store.ts`). The string `"updateEnvironment"` is passed where `ILogService` expected, and the actual error `err` is passed as the `operation` parameter. This silently swallows all `updateEnvironment` errors.

## Problem

- `logService.error()` called on string `"updateEnvironment"` - throws or silently fails
- No structured log emitted
- `orbion:config-error` DOM event fires with `operation: [Error object]`, `error: undefined` - UI cannot reconstruct what failed
- Every instance settings save (name change, agent runtime change) silently swallowed

## Fix

Add `logService` as first argument on line 109, and add `logService` to the `useCallback` dependency array on line 111.

## Files

- `src/renderer/src/store.ts` - line 109: add `logService` arg; line 111: add `logService` to deps
