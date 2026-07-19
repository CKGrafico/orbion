## Context

Orbion's instance selector already allows switching the runtime instance for a chat session. The current flow (in `App.tsx:handleInstanceSwitch`) updates `ChatSession.environmentId` and `workingDirectory`, then appends a plain assistant note. However:

- There is no interrupt of in-flight generation before the switch.
- Individual `TranscriptMessage` records have no `environmentId` field; attribution is only at the session level.
- The "Switched instance to X" note is rendered as a regular assistant message with no visual distinctness.

The issue (#99) requires that switching re-points the runtime (including MCP and working directory) **in place**, stops any in-flight generation, carries per-message attribution, and renders an explicit divider at the switch point. The sidebar filing must not change.

## Goals / Non-Goals

### Goals
1. Safe interruption of in-flight generation before instance switch completes.
2. Per-message `environmentId` attribution persisted and rendered on assistant messages.
3. A distinct visual handoff divider (not a regular chat bubble) at the switch point.
4. MCP tools refresh on the new instance after switch so the agent sees the correct tool set.
5. Sidebar filing (project) remains unchanged on switch.

### Non-Goals
- Moving a session between projects (separate feature).
- Cross-scope fan-out or fleet operations.
- Any UI outside the chat transcript area.
- Changing the InstanceSelector dropdown itself.

## Decisions

### D1: Interrupt before switch, not race

**Choice:** Call `agentService.interrupt(oldEnvId, sessionId)` inside `handleInstanceSwitch` and await it before updating `environmentId`.

**Alternative:** Update `environmentId` first and let the old stream naturally error or close. Rejected because the user could see a brief period where old-instance output wraps up after the UI shows the new instance—split-brain.

**Rationale:** Interrupting first is deterministic. The cost is a brief async delay (~100ms) before the switch visually commits, which is acceptable since the user explicitly chose to switch.

### D2: Per-message `environmentId` on TranscriptMessage

**Choice:** Add an optional `environmentId?: string` field to `TranscriptMessage` in `src/shared/ipc.ts`. All new messages (user and assistant) written after the switch carry the current instance's ID. Old messages without the field are attributed to whatever instance was active at the time (implicitly the session's environmentId).

**Alternative:** Store a separate "instance timeline" structure mapping turn ranges to environments. Rejected as over-engineered for the current need.

**Rationale:** A simple optional field is backward-compatible (existing persisted messages lack it) and sufficient for rendering. The UI can resolve the instance name from `environmentId` using the environments list.

### D3: Handoff divider as a new row kind

**Choice:** Introduce a new `instance-handoff` row kind in the transcript types. The `messagesToChatTurns` function detects messages with IDs starting with `instance-switch-` and produces an `InstanceHandoffRow` instead of pairing them as a turn.

**Alternative:** Keep the current approach (assistant message note) and merely style it differently via markup detection. Rejected because the note currently gets paired as an assistant message in a turn, which is semantically wrong (no user message precedes it, and it isn't agent output).

**Rationale:** A dedicated row kind gives clean separation: handoff dividers are not chat turns, they are structural markers. This matches how `turn-fold` rows work—they aren't messages either.

### D4: MCP connection check after switch

**Choice:** After the instance switch, dispatch `mcpService.connect(newEnvironmentId)` to ensure tools are discovered for the new instance. If it fails, the MCP status chip in the header will reflect it (existing UX).

**Alternative:** Lazy-reconnect on next tool call. Rejected because the agent's next prompt will try to use the MCP tools immediately, and a stale/disconnected MCP would produce confusing errors.

**Rationale:** Proactive connect gives immediate feedback. The MCP client is idempotent (`connectMcp` on an already-connected session is a no-op refresh).

## Risks / Trade-offs

- **[Race: Interrupt + streaming updates]** → The interrupt call is async and the stream may deliver a few more events before the main process kills the SSE connection. Mitigation: the renderer ignores events for the old `turnId` after `handleInstanceSwitch` commits the `environmentId` change by clearing `activeTurnId`.
- **[Backward compat: old transcripts without `environmentId`]** → Existing persisted messages have no `environmentId`. The renderer falls back to session-level attribution. No migration needed.
- **[Divider ID stability]** → Currently `instance-switch-${Date.now()}`. This is fine for a divider since it's never referenced by tool calls or streaming updates.
- **[Mock adapter]** → Must handle the new `environmentId` field on transcript messages. Trivial: pass through in mock append/update.

## Migration Plan

1. `TranscriptMessage.environmentId` is optional; no data migration needed.
2. The `instance-switch-*` message detection in `messagesToChatTurns` handles both old-format (plain assistant text) and new-format (handoff divider) transparently: old messages will still appear as assistant turns (no visual regression).
3. CSS for the handoff divider is additive; no styles are removed.

## Open Questions

None—all decisions resolved above.
