# gh-121: Archive — Move a chat to another project from the sidebar

**Status:** Implemented
**Branch:** feat/121-move-chat-to-project
**Commit:** 33f2daf

## What was done

All four tasks from the plan were implemented:

1. **Add `projectName` to updatable ChatSession fields** — Updated the partial pick type across `shared/ipc.ts`, `main/config-store.ts`, `main/index.ts`, `main/ipc-validation.ts`, `preload/index.ts`, `renderer/services/interfaces.ts`, `renderer/services/impl/ConfigService.ts`, `renderer/services/mock/MockServices.ts` to include `projectName` in the updatable fields.

2. **Add context menu component for session rows in Sidebar** — Added right-click (`onContextMenu`) handler on session rows that opens a floating context menu listing all project names (excluding the session's current project). The menu closes on click outside, Escape, or selection.

3. **Wire move-to-project flow in App.tsx** — Added `handleMoveSessionToProject` callback that:
   - If the current instance has the target project → updates only `projectName`
   - If the current instance lacks the target project → finds a connected instance that has it, updates `projectName` + `environmentId` + `workingDirectory`, and updates the active env selection
   - If no instance has the target project → shows an error toast
   - Shows a confirmation toast on success

4. **Add i18n strings** — Added `sidebar.moveToProject`, `sidebar.sessionMoved`, and `sidebar.moveToProjectUnavailable` keys.

## Files changed

- `src/shared/ipc.ts` — Added `projectName` to `updateChatSession` partial pick
- `src/main/config-store.ts` — Added `projectName` to `updateChatSession` signature
- `src/main/index.ts` — Updated IPC handler type
- `src/main/ipc-validation.ts` — Added `projectName` validation in `config:updateChatSession`
- `src/preload/index.ts` — Updated bridge type
- `src/renderer/src/services/interfaces.ts` — Updated `IConfigService.updateChatSession` type
- `src/renderer/src/services/impl/ConfigService.ts` — Updated implementation type
- `src/renderer/src/services/mock/MockServices.ts` — Updated mock type
- `src/renderer/src/components/Sidebar.tsx` — Added `onMoveSessionToProject` prop, context menu state, `onContextMenu` handler, context menu rendering
- `src/renderer/src/App.tsx` — Added `handleMoveSessionToProject` callback, wired to Sidebar
- `src/renderer/src/i18n/en.json` — Added move-to-project i18n strings
- `src/renderer/src/theme.css` — Added context menu styles

## Verification

- `pnpm typecheck` passes with 17 pre-existing errors (no new errors introduced)
