# gh-117: New chats are ephemeral by default, with a visible 'unsaved' marker

## Problem

Every new chat immediately appears as a durable sidebar entry. Quick errands (asking a question, trying a command) accumulate as permanent sessions, cluttering the sidebar and surprising users who assumed a one-off chat wouldn't be kept.

## Proposal

New chats are **ephemeral (scratch) by default** (`persisted: false`). They are fully functional — scope, tools, cards all work — but are not listed in the sidebar. A dim, persistent marker near the composer reads "scratch — won't be kept". Clicking "Keep this chat" persists the session (sets `persisted: true`), removes the marker, and adds it to the sidebar.

### Acceptance criteria (from issue #117)

- [x] A new chat is not listed as a durable session in the sidebar and carries an internal persisted/ephemeral flag.
- [x] It is fully functional (scope, tools, cards) while open.
- [x] Ephemeral chats show a dim persistent marker near the composer (e.g. "scratch - won't be kept"); the marker disappears the moment the chat is persisted.

## Scope

| Layer | Change |
|-------|--------|
| Shared `ipc.ts` | Add optional `persisted` boolean to `ChatSession` |
| Main `config-store.ts` | `updateChatSession` Partial Pick includes `persisted` |
| Main `index.ts` | IPC validator type includes `persisted` |
| Preload | Bridge type includes `persisted` in updateChatSession |
| Renderer `IConfigService` / `ConfigService` / `MockServices` | updateChatSession type includes `persisted` |
| Renderer `Sidebar.tsx` | Filter out ephemeral sessions from sidebar listing; fix `isProjectSelected` to highlight project for active ephemeral session |
| Renderer `ChatComposer.tsx` | Accept `isEphemeral` + `onPersistSession` props; render marker + persist button |
| Renderer `SessionChatView.tsx` | Pass ephemeral state and persist callback down |
| Renderer `App.tsx` | New sessions default to `persisted: false`; add `handlePersistSession`; pass `isEphemeral`/`onPersistSession` to `SessionChatView`; show header chip for ephemeral sessions |
| Renderer `i18n/en.json` | Add `session.ephemeralMarker` and `session.persistAction` strings |
| Renderer `theme.css` | Ephemeral marker, persist button, and header chip styles |

## Out of scope

- Inactivity sweep for old ephemeral chats (backstop only, not in this change)
- Conversational intent detection ("keep this") — future work
- Depth threshold auto-persist — future work
