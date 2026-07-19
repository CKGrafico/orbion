# Expand/collapse a project to reveal its sessions

**Issue:** #89
**Phase:** 3 — Chat core
**Branch:** feature/89-expand-collapse-project-sessions

## Summary

As a user, I want to expand a project to see its chat sessions and click one to open it.

## Acceptance criteria

- [x] Project rows toggle open/closed; open state persists across restarts.
- [x] Sessions render as indented rows with title + relative timestamp; clicking opens that chat.
- [x] The active session is visually marked.

## Design

### Data model

A new `ChatSession` type is added to `src/shared/ipc.ts`:

```ts
interface ChatSession {
  id: string;
  title: string;
  projectName: string;  // matches sidebar merge key
  lastActiveAt: string; // ISO timestamp
  createdAt: string;    // ISO timestamp
}
```

Sessions are filed under projects by `projectName` (matching the sidebar's existing merge-by-name logic).

### Persistence

- Chat sessions: `chatSessions` array in electron-store (main process), CRUD via new IPC channels.
- Expanded project state: `expandedProjects` string array in electron-store, persisted on toggle.
- Mock mode: both use localStorage fallbacks in `MockConfigService`.

### Sidebar tree structure

The existing two-level tree (Project > Loops) is extended:

```
Project (expandable chevron)
  ├── Chat Session 1 (title + relative time + active dot)
  ├── Chat Session 2
  ├── Loop 1 (status dot + label + run count)
  └── Loop 2
```

Sessions always appear before loops within an expanded project node.

### Active session marking

- The active session gets a lime accent dot (6px) and highlighted `MessageSquare` icon.
- The `active-session` CSS class provides visual distinction.

### IPC channels added

| Channel | Direction | Description |
|---------|-----------|-------------|
| `config:getChatSessions` | renderer → main | Get all chat sessions |
| `config:addChatSession` | renderer → main | Create a new session |
| `config:removeChatSession` | renderer → main | Delete a session |
| `config:updateChatSession` | renderer → main | Update title/lastActiveAt |
| `config:getExpandedProjects` | renderer → main | Get expanded project keys |
| `config:setExpandedProjects` | renderer → main | Set expanded project keys |

### View navigation

A new `session` view kind is added: `{ kind: "session"; sessionId: string }`. The `onNavigateToSession` prop on the Sidebar navigates to this view.
