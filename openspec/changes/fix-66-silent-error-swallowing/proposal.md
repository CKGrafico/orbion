# Fix silent error swallowing in renderer store.ts

## Change ID
fix-66-silent-error-swallowing

## Description
Replace all 8 `.catch(() => {})` instances in `src/renderer/src/store.ts` with proper error handling that logs errors to the console via a shared `handleConfigError` utility. This makes IPC-layer failures visible for debugging and prevents stale UI state from silently persisting.

## Rationale
Currently every critical config CRUD operation (select, remove, addEndpoint, removeEndpoint, setActiveEndpoint, removeSessionToken, setOpenCodeEndpoint, setMainVm) silently discards errors. When the main process rejects an operation (disk full, encryption unavailable, IPC validation error), the renderer never learns about it. The UI stays stale and the user sees no feedback.

The `setOpenCodeEndpoint` case is especially pernicious: its `.then()` chain checks `result.ok`, but `.catch(() => {})` swallows the rejection *before* `.then()` can even run — making the `result.ok` branch dead code on rejection.

## Approach
1. Create a `handleConfigError(operation: string, error: unknown)` utility in `src/renderer/src/store.ts` that logs to `console.error`.
2. Replace every `.catch(() => {})` with `.catch((err) => handleConfigError("<operation>", err))`.
3. For `setOpenCodeEndpoint`, also handle the `result.ok === false` case by logging the `reason` field.
4. Add i18n keys for future toast/notification integration (no toast UI in this change — logging is the minimum viable fix).

## Scope
- `src/renderer/src/store.ts` — all `.catch(() => {})` replaced, utility function added
- `src/renderer/src/i18n/en.json` — error message keys added for future use

## Out of scope
- Toast/notification UI component (separate change)
- Error handling in `AddVmWizard.tsx` and `LogViewer.tsx` (they have their own context-appropriate handling)
