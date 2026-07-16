# GH-38: IPC Input Validation

## Change ID
`gh-38-ipc-input-validation`

## Summary
Add runtime input validation to every `ipcMain.handle()` boundary in `src/main/index.ts`. Currently, all ~25 IPC handlers trust the renderer to send correctly-typed arguments. The TypeScript annotations are compile-time only — at runtime, a compromised renderer can send any value, causing crashes, security bypass, or data corruption.

## Problem
- **No validation** on any IPC handler arguments — TypeScript types are erased at runtime
- A compromised renderer (via XSS, navigation hijack, dev tools) can:
  - Crash the main process with unexpected types (`null`, `undefined`, wrong shapes)
  - Bypass URL allowlists (`baseUrl: null` → uncaught exception)
  - Perform path traversal (`path: "../../etc/passwd"`)
  - Inject data into SSH/API requests
  - Manipulate config store state

## Solution
1. Create a lightweight `validateIpc` utility in `src/main/ipc-validation.ts` — no new dependencies (manual checks, no zod/valibot)
2. Define validation schemas for each IPC channel's arguments
3. Wrap every `ipcMain.handle()` call with validation before processing
4. Return `{ ok: false, error: "ipc.validationFailed" }` on validation failure — never throw uncaught

## Scope
- `src/main/ipc-validation.ts` — NEW: validation utility + per-channel schemas
- `src/main/index.ts` — MODIFY: add `validateIpc()` call to every IPC handler
- `src/shared/ipc.ts` — no changes (types remain the contract source of truth)

## Risk
- Low: validation is additive; it only rejects malformed input
- Must ensure validation doesn't reject legitimate renderer calls (test by running typecheck + manual smoke test)
