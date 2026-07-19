# Spec: ChatSession model extension

## Data model

The `ChatSession` interface in `src/shared/ipc.ts` gains two new fields:

```typescript
export interface ChatSession {
  id: string;
  title: string;
  projectName: string;
  /** The environment (instance) this session is homed to. */
  environmentId: string;
  /** The project's working directory on the home instance (derived from loops' cwd at creation). */
  workingDirectory: string;
  lastActiveAt: string;
  createdAt: string;
}
```

### Derivation of `workingDirectory`

When creating a session from a project click:
1. Look up `perEnvLoops[environmentId]` for loops with `projectId` matching the project.
2. Take the `cwd` from the first matching loop.
3. If no loops exist yet, use `"~/<projectName>"` as a placeholder that updates once loops appear.
4. The working directory is stored on the session and can be updated via `updateChatSession`.

## IPC changes

- `addChatSession` now requires `environmentId` and `workingDirectory` in its input (the `Omit<ChatSession, "id" | "createdAt">` type naturally includes them).
- `updateChatSession` gains `environmentId` and `workingDirectory` in its updatable fields: `Partial<Pick<ChatSession, "title" | "lastActiveAt" | "environmentId" | "workingDirectory">>`.
- `config:updateChatSession` validation in `ipc-validation.ts` accepts the new fields.

## Config store

- `chatSessions` in `ConfigSchema` stores the extended `ChatSession` objects.
- Existing sessions without `environmentId` / `workingDirectory` are compatible: the renderer treats missing fields as `undefined` and the header gracefully hides the directory line.
- Migration: on first access, sessions missing `environmentId` get it populated from the currently selected environment or the first environment that has a project matching `session.projectName`.

## Mock adapter

- `MOCK_CHAT_SESSIONS` include `environmentId` (matching mock environment IDs) and `workingDirectory` paths.
- `MockConfigService.addChatSession` and `updateChatSession` handle the new fields.

# Spec: Session header rendering

## Header layout

When the view is `kind: "session"`, the main-header area renders:

```
[●] ProjectName    ~/working/directory
```

Where:
- `[●]` is an 8px color dot using the project's color (looked up from `perEnvProjects` via `environmentId` + `projectName`).
- `ProjectName` is the session's `projectName` in `--text-primary`, weight 700, 14px.
- `~/working/directory` is the session's `workingDirectory` in a muted monospace style (`--text-muted` color, monospace font family), presented as a chip-style element.

The header replaces the current placeholder text ("Chat session").

## Reactive updates

- If `perEnvProjects` changes (e.g. project color updates from a poll), the header re-renders with the new color.
- If the session's `environmentId` or `workingDirectory` changes (via `updateChatSession`), the header updates reactively.

# Spec: Session creation on project open

## Flow

1. User clicks a project node in the Sidebar.
2. Sidebar calls `onNavigate` with `{ kind: "project", projectId }` AND calls `onNavigateToSession` to create/resume a session.
3. In `App.tsx`, when navigating to a project, we check if a session already exists for `projectName × environmentId`.
4. If found, navigate to that session. If not, create one via `configService.addChatSession` with:
   - `title`: derived from project name (e.g. "Project: {name}")
   - `projectName`: the project's name
   - `environmentId`: the primary instance for that merged project
   - `workingDirectory`: derived from the first loop's `cwd` in that project on that instance
   - `lastActiveAt`: now
5. After creation, navigate to the session view and set it as `activeSessionId`.

## Sidebar changes

- Each project node in the sidebar gets a "Chat" action (a MessageSquare icon button, visible on hover or always).
- Clicking "Chat" opens/creates a session for that project.
- This is in addition to the existing click behavior (clicking the project row itself shows the project detail view).
