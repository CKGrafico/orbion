# gh-307: Security — log:write IPC bypasses safeHandle

## Summary

The `log:write` IPC channel is the only channel registered with raw `ipcMain.handle()` instead of the `safeHandle()` wrapper. This creates four security issues:

1. No structured validation error handling (silent `undefined` on rejection)
2. Arbitrary logger instance creation with forged module names
3. Unthrottled log flooding (DoS vector)
4. Inconsistent security posture (all other channels use safeHandle)

## Fix

1. Add a `log:write` validator to `ipc-validation.ts` that enforces:
   - Entry must be an object
   - `level` must be one of debug/info/warn/error
   - `message` must be a non-empty string (max 10,000 chars)
   - `module` must be a string on the allowlist (`renderer`, `chat`, `sidebar`) or prefixed with `renderer/`
   - `context` must be an object if provided
2. Migrate the handler from `ipcMain.handle()` to `safeHandle()` with `validateIpc()`
3. Add a per-environment rate limiter (max 120 log entries per 60s window, token bucket)
4. Remove the now-redundant `isLogEntry()` and `formatLogContext()` from `index.ts` (logic absorbed into the validator and handler)

## Files

- `src/main/ipc-validation.ts` — add `log:write` validator, module allowlist, rate limiter helpers
- `src/main/index.ts` — migrate handler, remove `isLogEntry`/`formatLogContext`
