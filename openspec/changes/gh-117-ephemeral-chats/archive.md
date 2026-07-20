# Archive: New chats are ephemeral by default, with a visible 'unsaved' marker

## Change ID

gh-117-ephemeral-chats

## Status

Applied

## Summary

Implemented ephemeral (scratch) chat sessions that are fully functional but not listed in the sidebar. New chats default to `persisted: false`, show a dim "scratch — won't be kept" marker near the composer, and offer a "Keep this chat" button. Clicking it persists the session to the sidebar and removes the marker. A secondary "scratch" chip also appears in the session header.

## What changed

### Modified files

- `src/shared/ipc.ts` — added `persisted?: boolean` to `ChatSession`; updated `updateChatSession` Partial Pick
- `src/main/config-store.ts` — `updateChatSession` type includes `persisted`
- `src/main/index.ts` — IPC validator type includes `persisted`
- `src/preload/index.ts` — bridge type includes `persisted` in `updateChatSession`
- `src/renderer/src/services/interfaces.ts` — `IConfigService.updateChatSession` includes `persisted`
- `src/renderer/src/services/impl/ConfigService.ts` — impl includes `persisted`
- `src/renderer/src/services/mock/MockServices.ts` — mock impl includes `persisted`; existing mock sessions set `persisted: true`
- `src/renderer/src/components/Sidebar.tsx` — filter out ephemeral sessions from sidebar; fix `isProjectSelected` to highlight project for active ephemeral session
- `src/renderer/src/chat/ChatComposer.tsx` — new `isEphemeral` and `onPersistSession` props; render ephemeral marker row
- `src/renderer/src/components/SessionChatView.tsx` — pass `isEphemeral` and `onPersistSession` to `ChatComposer`
- `src/renderer/src/App.tsx` — new sessions default to `persisted: false`; add `handlePersistSession`; pass ephemeral state to `SessionChatView`; header chip for ephemeral sessions
- `src/renderer/src/i18n/en.json` — `session.ephemeralMarker` and `session.persistAction` strings
- `src/renderer/src/theme.css` — `.composer-ephemeral-row`, `.composer-ephemeral-marker`, `.composer-persist-btn`, `.chip-ephemeral` styles

### New files

- `openspec/changes/gh-117-ephemeral-chats/` — OpenSpec change artifacts

## Acceptance criteria

- [x] A new chat is not listed as a durable session in the sidebar and carries an internal persisted/ephemeral flag.
- [x] It is fully functional (scope, tools, cards) while open.
- [x] Ephemeral chats show a dim persistent marker near the composer ("scratch — won't be kept"); the marker disappears the moment the chat is persisted.
