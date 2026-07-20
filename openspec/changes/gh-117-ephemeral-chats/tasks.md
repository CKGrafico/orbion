# Tasks: gh-117 — Ephemeral chats with unsaved marker

## 1. Data model — `persisted` flag

- [x] Add `persisted?: boolean` to `ChatSession` in `src/shared/ipc.ts`
- [x] Update `updateChatSession` Partial Pick in `ipc.ts`, `preload/index.ts`, `main/index.ts`, `main/config-store.ts`, `services/interfaces.ts`, `services/impl/ConfigService.ts`, `services/mock/MockServices.ts`
- [x] No validation change needed — `persisted` is optional boolean

## 2. Default new sessions to ephemeral

- [x] `App.tsx`: `addChatSession` call includes `persisted: false`

## 3. Sidebar filtering

- [x] `Sidebar.tsx`: `sessionsByProject` memo skips sessions where `!session.persisted`
- [x] `Sidebar.tsx`: `isProjectSelected` checks full `sessions` array for active session (not just `sessionsByProject`) so the project node highlights even for ephemeral sessions

## 4. Composer ephemeral marker

- [x] `ChatComposer.tsx`: new props `isEphemeral`, `onPersistSession`
- [x] Render `.composer-ephemeral-row` with `.composer-ephemeral-marker` text and `.composer-persist-btn` button
- [x] `theme.css`: styles for `.composer-ephemeral-row`, `.composer-ephemeral-marker`, `.composer-persist-btn`

## 5. Session header chip

- [x] `App.tsx` header: render `.chip-ephemeral` with "scratch — won't be kept" for unpersisted sessions
- [x] `theme.css`: `.chip-ephemeral` style

## 6. Wire persist action

- [x] `App.tsx`: `handlePersistSession` callback — calls `updateChatSession(id, { persisted: true })` and refreshes sessions
- [x] `SessionChatView.tsx`: pass `isEphemeral` and `onPersistSession` through to `ChatComposer`

## 7. i18n

- [x] `en.json`: `session.ephemeralMarker` = "scratch — won't be kept"
- [x] `en.json`: `session.persistAction` = "Keep this chat"

## 8. Mock adapter

- [x] `MockServices.ts`: Existing mock sessions have `persisted: true` for backward compatibility

## 9. Verify

- [x] `tsc --noEmit` passes with no errors
- [x] `vitest run src/renderer` passes all tests
