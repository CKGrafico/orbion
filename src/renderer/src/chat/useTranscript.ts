import { useCallback, useEffect, useRef, useState } from "react";
import { cid, useInject } from "inversify-hooks";
import type { TranscriptMessage, ToolCallRecord } from "../../../shared/ipc";
import type { ITranscriptService } from "../services/interfaces";
import type { AccessMode, ApprovalDecision, ChatTurn, ChatMessage, ToolCall, TranscriptRow, ToolCallRow, ToolCallsExpanderRow, TurnFoldRow, ApprovalRow, QuestionRow, InstanceHandoffRow } from "./types";

const TOOL_CALLS_THRESHOLD = 3;

/** A chat message is streaming if finishedAt is not set at all (undefined). */
function isStreaming(finishedAt: number | boolean | undefined): boolean {
  return finishedAt === undefined;
}

/** A chat message is finished if finishedAt is a number or boolean true. */
function isFinished(finishedAt: number | boolean | undefined): boolean {
  return finishedAt !== undefined;
}

// ---------------------------------------------------------------------------
// Conversion: ChatTurn ↔ TranscriptMessage
// ---------------------------------------------------------------------------

function toolCallToRecord(tc: ToolCall): ToolCallRecord {
  return {
    id: tc.id,
    kind: tc.kind,
    title: tc.title,
    status: tc.status,
    output: tc.output,
    startedAt: tc.startedAt,
    finishedAt: tc.finishedAt,
  };
}

function recordToToolCall(rec: ToolCallRecord): ToolCall {
  return {
    id: rec.id,
    kind: rec.kind,
    title: rec.title,
    status: rec.status,
    output: rec.output,
    startedAt: rec.startedAt,
    finishedAt: rec.finishedAt,
  };
}

function chatMessageToTranscriptMessage(
  sessionId: string,
  msg: ChatMessage,
): TranscriptMessage {
  return {
    id: msg.id,
    sessionId,
    role: msg.role,
    content: msg.content,
    toolCalls: msg.toolCalls?.map(toolCallToRecord),
    startedAt: msg.startedAt,
    finishedAt: typeof msg.finishedAt === "number" ? msg.finishedAt : undefined,
    createdAt: new Date().toISOString(),
    environmentId: msg.environmentId,
  };
}

function transcriptMessageToChatMessage(tm: TranscriptMessage): ChatMessage {
  return {
    id: tm.id,
    role: tm.role as "user" | "assistant",
    content: tm.content,
    toolCalls: tm.toolCalls?.map(recordToToolCall),
    startedAt: tm.startedAt,
    finishedAt: tm.finishedAt != null ? tm.finishedAt : (tm.content ? true : undefined),
    environmentId: tm.environmentId,
  };
}

/**
 * Check whether a transcript message is a system-generated handoff note
 * (e.g., instance switch, runtime switch, model switch).
 */
function isSystemNoteMessage(msg: TranscriptMessage): boolean {
  return msg.id.startsWith("instance-switch-") || msg.id.startsWith("runtime-switch-") || msg.id.startsWith("model-switch-");
}

/**
 * Extract instance handoff data from an instance-switch transcript message.
 * The content format is "Switched from X to Y" or the legacy "Switched instance to X".
 */
function parseInstanceHandoff(msg: TranscriptMessage): { fromInstance: string; toInstance: string } | null {
  if (!msg.id.startsWith("instance-switch-")) return null;
  // Try the new format: content has "from X to Y"
  const fromToMatch = msg.content.match(/from\s+(.+?)\s+to\s+(.+)/);
  if (fromToMatch) {
    return { fromInstance: fromToMatch[1].trim(), toInstance: fromToMatch[2].trim() };
  }
  // Legacy format: "Switched instance to X" – we don't have fromInstance
  const toMatch = msg.content.match(/to\s+(.+)/);
  if (toMatch) {
    return { fromInstance: "", toInstance: toMatch[1].trim() };
  }
  return { fromInstance: "", toInstance: msg.content };
}

/**
 * Group transcript messages into turns by pairing user and assistant messages.
 * Messages are assumed to arrive in order: user, assistant, user, assistant, ...
 * Tool messages (if any) are merged into the preceding assistant message.
 * System handoff notes (instance-switch-*, etc.) are skipped — they are rendered
 * as InstanceHandoffRow, not as chat turns.
 */
function messagesToChatTurns(messages: TranscriptMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  let currentUser: ChatMessage | null = null;

  for (const msg of messages) {
    // Skip system notes — they are rendered as InstanceHandoffRow, not turns
    if (isSystemNoteMessage(msg)) continue;

    const chatMsg = transcriptMessageToChatMessage(msg);

    if (msg.role === "user") {
      if (currentUser && turns.length > 0) {
        // Orphan user message without assistant; finalize previous turn
        turns[turns.length - 1] = {
          ...turns[turns.length - 1],
          interrupted: true,
          finished: true,
        };
      }
      currentUser = chatMsg;
    } else if (msg.role === "assistant" || msg.role === "tool") {
      if (!currentUser) continue; // No user message to pair with

      // Merge tool messages into the assistant message's toolCalls
      if (msg.role === "tool") {
        const lastTurn = turns[turns.length - 1];
        if (lastTurn && lastTurn.userMessage.id === currentUser.id) {
          if (chatMsg.toolCalls) {
            lastTurn.assistantMessage.toolCalls = [
              ...(lastTurn.assistantMessage.toolCalls ?? []),
              ...chatMsg.toolCalls,
            ];
          }
          continue;
        }
      }

      const turnId = `turn-${currentUser.id}`;
      turns.push({
        id: turnId,
        userMessage: currentUser,
        assistantMessage: chatMsg,
        finished: isFinished(chatMsg.finishedAt),
        collapsed: false,
        accessMode: "full",
      });
      currentUser = null;
    }
  }

  // Handle the case where a user message exists without a paired assistant
  if (currentUser) {
    turns.push({
      id: `turn-${currentUser.id}`,
      userMessage: currentUser,
      assistantMessage: {
        id: `assistant-${currentUser.id}`,
        role: "assistant",
        content: "",
        startedAt: Date.now(),
        finishedAt: undefined,
      },
      finished: false,
      collapsed: false,
      accessMode: "full",
    });
  }

  return turns;
}

// ---------------------------------------------------------------------------
// Row building
// ---------------------------------------------------------------------------

function buildRowsFromTurns(turns: ChatTurn[], handoffMessages: TranscriptMessage[] = []): TranscriptRow[] {
  const rows: TranscriptRow[] = [];

  // Build handoff rows from system note messages
  const handoffRows: Array<{ row: InstanceHandoffRow; timestamp: number }> = [];
  for (const msg of handoffMessages) {
    const handoff = parseInstanceHandoff(msg);
    if (handoff) {
      handoffRows.push({
        row: {
          id: msg.id,
          kind: "instance-handoff",
          turnId: msg.id,
          fromInstance: handoff.fromInstance,
          toInstance: handoff.toInstance,
        },
        timestamp: msg.startedAt,
      });
    }
  }

  // Build turn-based rows with timestamps for interleaving
  const turnRows: Array<{ rows: TranscriptRow[]; timestamp: number }> = [];
  for (const turn of turns) {
    const turnRowsList: TranscriptRow[] = [];

    turnRowsList.push({
      id: `user-${turn.id}`,
      kind: "user-message",
      turnId: turn.id,
      content: turn.userMessage.content,
    });

    if (turn.approval && !turn.approval.resolved) {
      turnRowsList.push({
        id: `approval-${turn.id}`,
        kind: "approval-request",
        turnId: turn.id,
        approval: turn.approval,
      } as ApprovalRow);
    }

    if (turn.question && !turn.question.resolved) {
      turnRowsList.push({
        id: `question-${turn.id}`,
        kind: "question-request",
        turnId: turn.id,
        question: turn.question,
      } as QuestionRow);
    }

    const tools = turn.assistantMessage.toolCalls ?? [];

    if (turn.finished && turn.collapsed) {
      const lastTool = tools[tools.length - 1];
      const durationSec = lastTool?.finishedAt
        ? Math.round((lastTool.finishedAt - turn.assistantMessage.startedAt) / 1000)
        : 0;
      turnRowsList.push({
        id: `fold-${turn.id}`,
        kind: "turn-fold",
        turnId: turn.id,
        toolCallCount: tools.length,
        durationSec,
      } as TurnFoldRow);
    } else {
      const visibleTools = tools;
      const hasExpander = visibleTools.length > TOOL_CALLS_THRESHOLD;

      if (hasExpander) {
        turnRowsList.push({
          id: `expander-${turn.id}`,
          kind: "tool-calls-expander",
          turnId: turn.id,
          count: visibleTools.length - TOOL_CALLS_THRESHOLD,
        } as ToolCallsExpanderRow);
      }

      const startIdx = hasExpander ? visibleTools.length - TOOL_CALLS_THRESHOLD : 0;
      for (let i = startIdx; i < visibleTools.length; i++) {
        const tc = visibleTools[i];
        turnRowsList.push({
          id: `tool-${turn.id}-${tc.id}`,
          kind: "tool-call",
          turnId: turn.id,
          toolCall: tc,
          expanded: false,
        } as ToolCallRow);
      }
    }

    const messageStreaming = isStreaming(turn.assistantMessage.finishedAt);
    if (turn.assistantMessage.content || messageStreaming) {
      turnRowsList.push({
        id: `assistant-${turn.id}`,
        kind: "assistant-message",
        turnId: turn.id,
        content: turn.assistantMessage.content,
        streaming: messageStreaming,
        environmentId: turn.assistantMessage.environmentId,
      });
    }

    turnRows.push({ rows: turnRowsList, timestamp: turn.userMessage.startedAt });
  }

  // Merge turn groups and handoff dividers by timestamp
  type MergeItem = { kind: "turn"; rows: TranscriptRow[]; timestamp: number } | { kind: "handoff"; row: InstanceHandoffRow; timestamp: number };
  const merged: MergeItem[] = [
    ...turnRows.map((t) => ({ kind: "turn" as const, rows: t.rows, timestamp: t.timestamp })),
    ...handoffRows.map((h) => ({ kind: "handoff" as const, row: h.row, timestamp: h.timestamp })),
  ];
  merged.sort((a, b) => a.timestamp - b.timestamp);

  for (const item of merged) {
    if (item.kind === "handoff") {
      rows.push(item.row);
    } else {
      rows.push(...item.rows);
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// useTranscript hook
// ---------------------------------------------------------------------------

export function useTranscript(sessionId: string | null) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [handoffMessages, setHandoffMessages] = useState<TranscriptMessage[]>([]);
  const [rows, setRows] = useState<TranscriptRow[]>([]);
  const expandedToolsRef = useRef<Set<string>>(new Set());
  const [transcriptService] = useInject<ITranscriptService>(cid.ITranscriptService);
  const loadingRef = useRef(false);
  const loadedSessionRef = useRef<string | null>(null);
  const persistTimerRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const PERSIST_DEBOUNCE_MS = 300;
  const turnsRef = useRef<ChatTurn[]>([]);

  // ── Debounced persistence ──────────────────────────────────────────

  const persistUserMessage = useCallback(
    (sessionId: string, msg: ChatMessage) => {
      if (!transcriptService) return;
      const tm = chatMessageToTranscriptMessage(sessionId, msg);
      void transcriptService.appendMessage(tm);
    },
    [transcriptService],
  );

  const persistAssistantUpdate = useCallback(
    (_sessionId: string, msgId: string, updates: Partial<Pick<TranscriptMessage, "content" | "toolCalls" | "finishedAt">>) => {
      if (!transcriptService) return;

      // Debounce rapid streaming updates
      const existing = persistTimerRef.current.get(msgId);
      if (existing) clearTimeout(existing);

      // For content updates during streaming, debounce
      if ("content" in updates && !("finishedAt" in updates)) {
        persistTimerRef.current.set(
          msgId,
          setTimeout(() => {
            persistTimerRef.current.delete(msgId);
            void transcriptService.updateMessage(msgId, updates);
          }, PERSIST_DEBOUNCE_MS),
        );
      } else {
        // For finishedAt or toolCalls updates, persist immediately
        void transcriptService.updateMessage(msgId, updates);
      }
    },
    [transcriptService],
  );

  const persistAssistantMessage = useCallback(
    (sessionId: string, msg: ChatMessage) => {
      if (!transcriptService) return;
      const tm = chatMessageToTranscriptMessage(sessionId, msg);
      void transcriptService.appendMessage(tm);
    },
    [transcriptService],
  );

  // ── Load from session ──────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId || sessionId === loadedSessionRef.current) return;
    if (loadingRef.current) return;

    let cancelled = false;
    loadingRef.current = true;

    transcriptService.getMessages(sessionId).then((messages) => {
      if (cancelled) return;
      const hydratedTurns = messagesToChatTurns(messages);
      const handoffs = messages.filter(isSystemNoteMessage);
      setTurns(hydratedTurns);
      setHandoffMessages(handoffs);
      setRows(buildRowsFromTurns(hydratedTurns, handoffs));
      loadedSessionRef.current = sessionId;
      loadingRef.current = false;
    }).catch(() => {
      if (cancelled) return;
      loadingRef.current = false;
    });

    return () => {
      cancelled = true;
    };
  }, [sessionId, transcriptService]);

  // ── Row rebuild helpers ────────────────────────────────────────────

  // Keep turnsRef in sync for use in effects
  turnsRef.current = turns;

  const rebuildRows = useCallback((newTurns: ChatTurn[]): TranscriptRow[] => {
    const newRows = buildRowsFromTurns(newTurns, handoffMessages);
    setRows(newRows);
    return newRows;
  }, [handoffMessages]);

  // Rebuild rows when handoffMessages changes (e.g., when a new handoff is added)
  useEffect(() => {
    const newRows = buildRowsFromTurns(turnsRef.current, handoffMessages);
    setRows(newRows);
  }, [handoffMessages]);

  const setTurnsAndRebuild = useCallback(
    (updater: (prev: ChatTurn[]) => ChatTurn[]) => {
      setTurns((prev) => {
        const next = updater(prev);
        rebuildRows(next);
        return next;
      });
    },
    [rebuildRows],
  );

  // ── Turn mutations (with persistence) ──────────────────────────────

  const toggleTurnCollapse = useCallback(
    (turnId: string) => {
      setTurns((prev) => {
        const next = prev.map((t) =>
          t.id === turnId ? { ...t, collapsed: !t.collapsed } : t,
        );
        rebuildRows(next);
        return next;
      });
    },
    [rebuildRows],
  );

  const toggleToolExpand = useCallback(
    (rowId: string) => {
      setRows((prev) => {
        const expanded = new Set(expandedToolsRef.current);
        if (expanded.has(rowId)) {
          expanded.delete(rowId);
        } else {
          expanded.add(rowId);
        }
        expandedToolsRef.current = expanded;
        return prev.map((r) =>
          r.kind === "tool-call" && r.id === rowId
            ? { ...r, expanded: !r.expanded }
            : r,
        );
      });
    },
    [],
  );

  const collapseAllFinishedTurns = useCallback(() => {
    setTurns((prev) => {
      const next = prev.map((t) =>
        t.finished && !t.collapsed ? { ...t, collapsed: true } : t,
      );
      rebuildRows(next);
      return next;
    });
  }, [rebuildRows]);

  const expandAllTurns = useCallback(() => {
    setTurns((prev) => {
      const next = prev.map((t) =>
        t.collapsed ? { ...t, collapsed: false } : t,
      );
      rebuildRows(next);
      return next;
    });
  }, [rebuildRows]);

  const addTurn = useCallback(
    (turn: ChatTurn) => {
      setTurnsAndRebuild((prev) => [...prev, turn]);

      // Persist both messages
      if (sessionId) {
        persistUserMessage(sessionId, turn.userMessage);
        persistAssistantMessage(sessionId, turn.assistantMessage);
      }
    },
    [setTurnsAndRebuild, sessionId, persistUserMessage, persistAssistantMessage],
  );

  const updateTurn = useCallback(
    (turnId: string, updater: (turn: ChatTurn) => ChatTurn) => {
      setTurnsAndRebuild((prev) =>
        prev.map((t) => (t.id === turnId ? updater(t) : t)),
      );
    },
    [setTurnsAndRebuild],
  );

  const appendAssistantContent = useCallback(
    (turnId: string, chunk: string) => {
      setTurns((prev) => {
        const next = prev.map((t) => {
          if (t.id !== turnId) return t;
          const newContent = t.assistantMessage.content + chunk;
          return {
            ...t,
            assistantMessage: {
              ...t.assistantMessage,
              content: newContent,
            },
          };
        });
        rebuildRows(next);

        // Persist the content update (debounced)
        if (sessionId) {
          const turn = next.find((t) => t.id === turnId);
          if (turn) {
            persistAssistantUpdate(sessionId, turn.assistantMessage.id, {
              content: turn.assistantMessage.content,
            });
          }
        }

        return next;
      });
    },
    [rebuildRows, sessionId, persistAssistantUpdate],
  );

  const finishTurn = useCallback(
    (turnId: string) => {
      const finishedAt = Date.now();
      setTurns((prev) => {
        const next = prev.map((t) => {
          if (t.id !== turnId) return t;
          return {
            ...t,
            finished: true,
            assistantMessage: {
              ...t.assistantMessage,
              finishedAt,
            },
          };
        });
        rebuildRows(next);

        // Persist the finish
        if (sessionId) {
          const turn = next.find((t) => t.id === turnId);
          if (turn) {
            persistAssistantUpdate(sessionId, turn.assistantMessage.id, {
              finishedAt,
            });
          }
        }

        return next;
      });
    },
    [rebuildRows, sessionId, persistAssistantUpdate],
  );

  const interruptTurn = useCallback(
    (turnId: string) => {
      const finishedAt = Date.now();
      setTurns((prev) => {
        const next = prev.map((t) => {
          if (t.id !== turnId) return t;
          return {
            ...t,
            finished: true,
            interrupted: true,
            assistantMessage: {
              ...t.assistantMessage,
              finishedAt,
            },
          };
        });
        rebuildRows(next);

        // Persist the finish
        if (sessionId) {
          const turn = next.find((t) => t.id === turnId);
          if (turn) {
            persistAssistantUpdate(sessionId, turn.assistantMessage.id, {
              finishedAt,
            });
          }
        }

        return next;
      });
    },
    [rebuildRows, sessionId, persistAssistantUpdate],
  );

  const resolveApproval = useCallback(
    (turnId: string, decision: ApprovalDecision) => {
      setTurns((prev) => {
        const next = prev.map((t) => {
          if (t.id !== turnId || !t.approval) return t;
          return {
            ...t,
            approval: { ...t.approval, resolved: true, decision },
          };
        });
        rebuildRows(next);
        return next;
      });
    },
    [rebuildRows],
  );

  const answerQuestion = useCallback(
    (turnId: string, answer: string) => {
      setTurns((prev) => {
        const next = prev.map((t) => {
          if (t.id !== turnId || !t.question) return t;
          return {
            ...t,
            question: { ...t.question, resolved: true, answer },
          };
        });
        rebuildRows(next);
        return next;
      });
    },
    [rebuildRows],
  );

  const setTurnAccessMode = useCallback(
    (turnId: string, mode: AccessMode) => {
      setTurns((prev) => {
        const next = prev.map((t) =>
          t.id === turnId ? { ...t, accessMode: mode } : t,
        );
        rebuildRows(next);
        return next;
      });
    },
    [rebuildRows],
  );

  const addHandoffMessage = useCallback(
    (message: TranscriptMessage) => {
      if (!isSystemNoteMessage(message)) return;
      setHandoffMessages((prev) => [...prev, message]);
    },
    [],
  );

  /** Force a reload of the transcript from the persistence layer. */
  const reloadTranscript = useCallback(() => {
    if (!sessionId) return;
    loadedSessionRef.current = null;
    loadingRef.current = false;
    transcriptService.getMessages(sessionId).then((messages) => {
      const hydratedTurns = messagesToChatTurns(messages);
      const handoffs = messages.filter(isSystemNoteMessage);
      setTurns(hydratedTurns);
      setHandoffMessages(handoffs);
      setRows(buildRowsFromTurns(hydratedTurns, handoffs));
      loadedSessionRef.current = sessionId;
    }).catch(() => {
      // Ignore errors
    });
  }, [sessionId, transcriptService]);

  return {
    turns,
    rows,
    toggleTurnCollapse,
    toggleToolExpand,
    collapseAllFinishedTurns,
    expandAllTurns,
    addTurn,
    updateTurn,
    appendAssistantContent,
    finishTurn,
    interruptTurn,
    resolveApproval,
    answerQuestion,
    setTurnAccessMode,
    addHandoffMessage,
    reloadTranscript,
  };
}
