# Proposal: Fix BatchOverlapResult.perPrNotes IPC Serialization Bug

## Problem

`BatchOverlapResult.perPrNotes` is typed as `Map<string, string[]>` in `src/shared/ipc.ts:432`. Electron's IPC structured clone algorithm does not reliably preserve `Map` across `ipcMain.handle()` boundaries. The `Map` is silently stripped or converted to `{}`, corrupting data in the renderer with no error raised.

## Solution

Change `perPrNotes` from `Map<string, string[]>` to `Record<string, string[]>`. This is a plain-serializable type that survives all IPC paths, including JSON serialization in logging and error boundaries.

## Scope

Focused — 4 source files, all in renderer/shared:

| File | Change |
|------|--------|
| `src/shared/ipc.ts` | Type: `Map<string, string[]>` → `Record<string, string[]>` |
| `src/renderer/src/features/review/detect-overlaps.ts` | Replace `new Map()` + `.set()` + `.get()` with plain object |
| `src/renderer/src/features/review/ReviewQueueStrip.tsx` | Replace `.get(key)` with bracket access `[]` |
| `src/renderer/src/services/impl/ReviewModeService.ts` | Replace `new Map()` with `{}` |

## Acceptance Criteria

1. `perPrNotes` survives IPC round-trip — renderer receives all entries main process set
2. Type is IPC-safe (`Record<string, string[]>`)
3. `pnpm typecheck` passes
4. `pnpm test` passes
5. `pnpm build` passes
