# Local transcript store owned by Orbion

**Issue:** #91
**Phase:** 3 — Chat core
**Branch:** feature/91-local-transcript-store

## Summary

As a user, I want conversation history stored by Orbion on my machine, so a VM dying never loses my chats.

## Acceptance criteria

- [x] Messages (user, assistant, tool events) persist locally per session and reload on reopen.
- [x] The transcript is instance-independent: it survives instance removal or unreachability.
- [x] Storage handles append-heavy writes without blocking the UI.

## Design

### Data model

A new `TranscriptMessage` type is added to `src/shared/ipc.ts` representing a single persisted message event:

```ts
interface TranscriptMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCallRecord[];
  startedAt: number;
  finishedAt?: number;
  createdAt: string; // ISO timestamp
}

interface ToolCallRecord {
  id: string;
  kind: string;
  title: string;
  status: "running" | "completed" | "error";
  output?: string;
  startedAt: number;
  finishedAt?: number;
}
```

The transcript is tied to `sessionId` (a `ChatSession.id`), not to any `environmentId`. This makes the transcript instance-independent by design, satisfying the requirement that it survives instance removal or unreachability.

### Persistence strategy

Transcripts are stored in the **main process** using `electron-store` (extending the existing `config-store.ts` pattern), with a dedicated `transcriptMessages` key holding a flat array of `TranscriptMessage` objects keyed by session.

However, append-heavy writes against a single large JSON key would degrade. The design uses a **per-session file approach** underneath: each session's transcript is stored in a separate JSON file under `userData/transcripts/<sessionId>.json`. This avoids rewriting all transcripts on every append and keeps individual session files small.

The main process exposes CRUD IPC channels. The renderer accesses transcripts only through the typed IPC bridge, per the existing trust boundary.

### Write serialization

Transcript writes are serialized through the same `serialize()` queue pattern used by config-store, preventing read-modify-write races for concurrent appends to the same session file. Append operations write only the affected session file, not the entire store.

### IPC channels added

| Channel | Direction | Description |
|---------|-----------|-------------|
| `transcript:getMessages` | renderer -> main | Get all messages for a session |
| `transcript:appendMessage` | renderer -> main | Append a single message to a session |
| `transcript:appendMessages` | renderer -> main | Append multiple messages atomically (batch append for initial load/replay) |
| `transcript:deleteSession` | renderer -> main | Delete all messages for a session |
| `transcript:updateMessage` | renderer -> main | Update a specific message (for streaming content updates) |

### Renderer integration

A new `ITranscriptService` interface is added to the DI container with real and mock implementations. The `useTranscript` hook is extended to:

1. On session open: load persisted messages from the service and hydrate the turns state.
2. On each turn mutation (addTurn, appendAssistantContent, finishTurn, etc.): persist the change through the service.
3. On session close: no action needed, writes are incremental.

The existing `ChatTurn`/`ChatMessage`/`ToolCall` types in `chat/types.ts` remain the in-memory working types. Conversion functions map between the domain types and the persistence `TranscriptMessage` shape.

### Mock mode

`MockTranscriptService` uses `localStorage` as the backing store (matching the existing mock pattern). It stores transcripts under `orbion.transcript.<sessionId>` keys.

### File-based storage in main process

A new `transcript-store.ts` module in `src/main/` handles per-session file I/O:

- `getTranscriptDir()` returns `path.join(app.getPath("userData"), "transcripts")`.
- Each session file is a JSON array of `TranscriptMessage` objects.
- Files are created on first append and deleted on `transcript:deleteSession`.
- A debounce timer (200ms) batches rapid sequential writes to the same file, reducing disk I/O during streaming assistant content.

### Cleanup

When a `ChatSession` is removed via `config:removeChatSession`, the corresponding transcript file is also deleted. This is handled in the main process by calling the transcript store's delete function from the existing remove environment/session cleanup path.
