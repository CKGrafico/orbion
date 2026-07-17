# Fix: Silent error swallowing causes invisible data loss

**Change ID:** fix-71-silent-error-swallowing
**Issue:** #71
**Severity:** High (data loss risk + zero observability)

## Problem

Multiple critical paths across the main process silently catch and discard errors, making production issues impossible to diagnose and causing invisible data loss:

1. **`config-store.ts` `serialize()`** — `catch(() => {})` swallows ALL write errors. If electron-store writes fail (disk full, permissions, file locked), config mutations are silently lost. The user sees a successful operation, but on restart the data is gone.

2. **`index.ts` bounds persistence** — `loadBounds()` silently overwrites corrupt files with defaults. `saveBounds()` silently swallows write errors. No logging, no fallback.

3. **`connection-supervisor.ts` probe errors** — Original error (network details, stack) is fully replaced with a generic i18n message, losing all diagnostic context.

4. **Renderer `store.ts`** — All CRUD operations fire-and-forget via `void configService.*().catch(handleConfigError)`. While `handleConfigError` does `console.error`, nothing surfaces to the user — mutations can fail silently from the user perspective.

## Solution

1. **`serialize()`**: Log the error AND propagate it to the IPC caller (reject the returned Promise).
2. **Bounds persistence**: Add `console.warn` in catch blocks. Log the actual error object.
3. **Connection supervisor**: Preserve original error as a `.cause` property on the fallback ProbeResult for debugging.
4. **Renderer**: Surface config-write failures to the user via the existing notification service instead of only logging to console.

## Files Touched

- `src/main/config-store.ts`
- `src/main/index.ts`
- `src/main/connection-supervisor.ts`
- `src/renderer/src/store.ts`
