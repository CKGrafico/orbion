import { useCallback, useEffect, useRef, useState } from "react";
import { cid, useInject } from "inversify-hooks";
import type { TranscriptMessage, ToolCallRecord } from "../../../shared/ipc";
import type { ITranscriptService } from "../services/interfaces";
import type { AccessMode, ApprovalDecision, ChatTurn, ChatMessage, ToolCall, TranscriptRow, ToolCallRow, ToolCallsExpanderRow, TurnFoldRow, ApprovalRow, QuestionRow, InstanceHandoffRow, LoopCardRow, LoopProposalRow, LoopProposalStatus, ChainEditProposalRow, ChainEditProposalStatus, SharedTaskWarning, SiblingOfferRow, SiblingOfferStatus, FailureDiagnosisRow } from "./types";
import type { FailureCategory } from "./diagnoseFailure";

const TOOL_CALLS_THRESHOLD = 3;

/** A chat message is streaming if finishedAt is not set at all (undefined). */
function isStreaming(finishedAt: number | undefined): boolean {
  return finishedAt === undefined;
}

/** A chat message is finished if finishedAt is set (a number). */
function isFinished(finishedAt: number | undefined): boolean {
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
    finishedAt: tm.finishedAt != null ? tm.finishedAt : (tm.content ? tm.startedAt : undefined),
    environmentId: tm.environmentId,
  };
}

/**
 * Check whether a transcript message is a system-generated handoff note
 * (e.g., instance switch, runtime switch, model switch).
 */
function isSystemNoteMessage(msg: TranscriptMessage): boolean {
  return msg.id.startsWith("instance-switch-") || msg.id.startsWith("runtime-switch-") || msg.id.startsWith("model-switch-") || msg.id.startsWith("loop-summon-") || msg.id.startsWith("loop-proposal-") || msg.id.startsWith("chain-edit-proposal-") || msg.id.startsWith("sibling-offer-") || msg.id.startsWith("failure-diagnosis-");
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
 * Check whether a transcript message is a loop-card summon record
 * (produced when the user clicks a loop-summary-bar segment).
 * These use the convention: id starts with "loop-summon-", role "user",
 * and content is a JSON array of loop IDs.
 */
function isLoopSummonMessage(msg: TranscriptMessage): boolean {
  return msg.id.startsWith("loop-summon-");
}

/**
 * Parse a loop-summon transcript message into an array of loop IDs.
 * Returns null if parsing fails.
 */
function parseLoopSummon(msg: TranscriptMessage): { loopIds: string[]; environmentId: string } | null {
  try {
    const parsed = JSON.parse(msg.content);
    if (Array.isArray(parsed.loopIds)) {
      return { loopIds: parsed.loopIds, environmentId: parsed.environmentId ?? msg.environmentId ?? "" };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check whether a transcript message is a loop-proposal record.
 * These use the convention: id starts with "loop-proposal-", role "user".
 */
function isLoopProposalMessage(msg: TranscriptMessage): boolean {
  return msg.id.startsWith("loop-proposal-");
}

/**
 * Parse a loop-proposal transcript message into a LoopProposalRow.
 * Returns null if parsing fails.
 */
function parseLoopProposalMessage(msg: TranscriptMessage): LoopProposalRow | null {
  try {
    const parsed = JSON.parse(msg.content);
    if (parsed.kind !== "loop-proposal") return null;
    const adaptedFrom = parsed.adaptedFrom
      ? {
          loopId: parsed.adaptedFrom.loopId ?? "",
          environmentId: parsed.adaptedFrom.environmentId ?? "",
          environmentName: parsed.adaptedFrom.environmentName ?? "",
          loopDescription: parsed.adaptedFrom.loopDescription ?? "",
          chainSteps: Array.isArray(parsed.adaptedFrom.chainSteps) ? parsed.adaptedFrom.chainSteps : [],
          substitutions: Array.isArray(parsed.adaptedFrom.substitutions) ? parsed.adaptedFrom.substitutions : [],
        }
      : null;
    return {
      id: msg.id,
      kind: "loop-proposal",
      turnId: msg.id,
      proposalId: parsed.proposalId ?? msg.id,
      command: parsed.command ?? "",
      commandArgs: parsed.commandArgs ?? [],
      interval: parsed.interval ?? "",
      projectId: parsed.projectId ?? "",
      projectName: parsed.projectName ?? "",
      runImmediately: parsed.runImmediately ?? false,
      maxRuns: parsed.maxRuns ?? null,
      suggestedMaxRuns: parsed.suggestedMaxRuns ?? null,
      environmentId: parsed.environmentId ?? msg.environmentId ?? "",
      status: parsed.status ?? "pending",
      createdLoopId: parsed.createdLoopId ?? null,
      error: parsed.error ?? null,
      provenance: parsed.provenance ?? null,
      adaptedFrom,
    };
  } catch {
    return null;
  }
}

/**
 * Check whether a transcript message is a sibling-offer record.
 * These use the convention: id starts with "sibling-offer-", role "user".
 */
function isSiblingOfferMessage(msg: TranscriptMessage): boolean {
  return msg.id.startsWith("sibling-offer-");
}

/**
 * Parse a sibling-offer transcript message into a SiblingOfferRow.
 * Returns null if parsing fails.
 */
function parseSiblingOfferMessage(msg: TranscriptMessage): SiblingOfferRow | null {
  try {
    const parsed = JSON.parse(msg.content);
    if (parsed.kind !== "sibling-offer") return null;
    return {
      id: msg.id,
      kind: "sibling-offer",
      turnId: msg.id,
      offerId: parsed.offerId ?? msg.id,
      siblingLoopId: parsed.siblingLoopId ?? "",
      siblingEnvironmentId: parsed.siblingEnvironmentId ?? "",
      siblingEnvironmentName: parsed.siblingEnvironmentName ?? "",
      siblingLoopDescription: parsed.siblingLoopDescription ?? "",
      structuralDiff: parsed.structuralDiff ?? { sourceLoopId: "", sourceEnvironmentId: "", operations: [], fingerprint: "", postEditTopology: { steps: [] } },
      status: parsed.status ?? "pending",
      error: parsed.error ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Check whether a transcript message is a failure-diagnosis record.
 * These use the convention: id starts with "failure-diagnosis-", role "user".
 */
function isFailureDiagnosisMessage(msg: TranscriptMessage): boolean {
  return msg.id.startsWith("failure-diagnosis-");
}

/**
 * Parse a failure-diagnosis transcript message into a FailureDiagnosisRow.
 * Returns null if parsing fails.
 */
function parseFailureDiagnosisMessage(msg: TranscriptMessage): FailureDiagnosisRow | null {
  try {
    const parsed = JSON.parse(msg.content);
    if (parsed.kind !== "failure-diagnosis") return null;
    return {
      id: msg.id,
      kind: "failure-diagnosis",
      turnId: msg.id,
      loopId: parsed.loopId ?? "",
      environmentId: parsed.environmentId ?? msg.environmentId ?? "",
      category: parsed.category ?? "unknown",
      summary: parsed.summary ?? "",
      nextStep: parsed.nextStep ?? "",
      confidence: parsed.confidence ?? "low",
    };
  } catch {
    return null;
  }
}

/**
 * Check whether a transcript message is a chain-edit-proposal record.
 * These use the convention: id starts with "chain-edit-proposal-", role "user".
 */
function isChainEditProposalMessage(msg: TranscriptMessage): boolean {
  return msg.id.startsWith("chain-edit-proposal-");
}

/**
 * Parse a chain-edit-proposal transcript message into a ChainEditProposalRow.
 * Returns null if parsing fails.
 */
function parseChainEditProposalMessage(msg: TranscriptMessage): ChainEditProposalRow | null {
  try {
    const parsed = JSON.parse(msg.content);
    if (parsed.kind !== "chain-edit-proposal") return null;
    const sharedTaskWarning: SharedTaskWarning | undefined =
      parsed.sharedTaskWarning
        ? {
            taskIds: Array.isArray(parsed.sharedTaskWarning.taskIds) ? parsed.sharedTaskWarning.taskIds : [],
            referencingLoops: Array.isArray(parsed.sharedTaskWarning.referencingLoops) ? parsed.sharedTaskWarning.referencingLoops : [],
            decision: parsed.sharedTaskWarning.decision ?? null,
          }
        : undefined;

    return {
      id: msg.id,
      kind: "chain-edit-proposal",
      turnId: msg.id,
      proposalId: parsed.proposalId ?? msg.id,
      loopId: parsed.loopId ?? "",
      environmentId: parsed.environmentId ?? msg.environmentId ?? "",
      proposedSteps: Array.isArray(parsed.proposedSteps) ? parsed.proposedSteps : [],
      operationSummaries: Array.isArray(parsed.operationSummaries) ? parsed.operationSummaries : [],
      status: parsed.status ?? "pending",
      error: parsed.error ?? null,
      sharedTaskWarning,
    };
  } catch {
    return null;
  }
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

function buildRowsFromTurns(turns: ChatTurn[], handoffMessages: TranscriptMessage[] = [], loopSummonMessages: TranscriptMessage[] = [], loopProposalMessages: TranscriptMessage[] = [], chainEditProposalMessages: TranscriptMessage[] = [], siblingOfferMessages: TranscriptMessage[] = [], failureDiagnosisMessages: TranscriptMessage[] = []): TranscriptRow[] {
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

  // Build loop-card rows from loop-summon messages
  // Each loop-summon message can produce multiple LoopCardRows (one per loop ID)
  const loopCardRows: Array<{ row: LoopCardRow; timestamp: number }> = [];
  for (const msg of loopSummonMessages) {
    const summon = parseLoopSummon(msg);
    if (summon) {
      for (let i = 0; i < summon.loopIds.length; i++) {
        const loopId = summon.loopIds[i];
        loopCardRows.push({
          row: {
            id: `${msg.id}-lc-${loopId}`,
            kind: "loop-card",
            turnId: msg.id,
            loopId,
            environmentId: summon.environmentId,
          },
          timestamp: msg.startedAt + i, // Ensure stable ordering within a summon
        });
      }
    }
  }

  // Build loop-proposal rows from loop-proposal messages
  const loopProposalRows: Array<{ row: LoopProposalRow; timestamp: number }> = [];
  for (const msg of loopProposalMessages) {
    const proposalRow = parseLoopProposalMessage(msg);
    if (proposalRow) {
      loopProposalRows.push({ row: proposalRow, timestamp: msg.startedAt });
    }
  }

  // Build chain-edit-proposal rows from chain-edit-proposal messages
  const chainEditProposalRows: Array<{ row: ChainEditProposalRow; timestamp: number }> = [];
  for (const msg of chainEditProposalMessages) {
    const row = parseChainEditProposalMessage(msg);
    if (row) {
      chainEditProposalRows.push({ row, timestamp: msg.startedAt });
    }
  }

  // Build sibling-offer rows from sibling-offer messages
  const siblingOfferRows: Array<{ row: SiblingOfferRow; timestamp: number }> = [];
  for (const msg of siblingOfferMessages) {
    const row = parseSiblingOfferMessage(msg);
    if (row) {
      // Place sibling offers right after their parent chain-edit proposal (1ms later for ordering)
      siblingOfferRows.push({ row, timestamp: msg.startedAt + 1 });
    }
  }

  // Build failure-diagnosis rows from failure-diagnosis messages
  const failureDiagnosisRows: Array<{ row: FailureDiagnosisRow; timestamp: number }> = [];
  for (const msg of failureDiagnosisMessages) {
    const diagnosisRow = parseFailureDiagnosisMessage(msg);
    if (diagnosisRow) {
      // Place the diagnosis right after its associated loop card:
      // use a timestamp 1ms after the loop-summon timestamp (encoded in the message ID)
      failureDiagnosisRows.push({ row: diagnosisRow, timestamp: msg.startedAt + 1 });
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

  // Merge turn groups, handoff dividers, loop-card rows, loop-proposal rows, chain-edit-proposal rows, and failure-diagnosis rows by timestamp
  type MergeItem = { kind: "turn"; rows: TranscriptRow[]; timestamp: number } | { kind: "handoff"; row: InstanceHandoffRow; timestamp: number } | { kind: "loop-card"; row: LoopCardRow; timestamp: number } | { kind: "loop-proposal"; row: LoopProposalRow; timestamp: number } | { kind: "chain-edit-proposal"; row: ChainEditProposalRow; timestamp: number } | { kind: "sibling-offer"; row: SiblingOfferRow; timestamp: number } | { kind: "failure-diagnosis"; row: FailureDiagnosisRow; timestamp: number };
  const merged: MergeItem[] = [
    ...turnRows.map((t) => ({ kind: "turn" as const, rows: t.rows, timestamp: t.timestamp })),
    ...handoffRows.map((h) => ({ kind: "handoff" as const, row: h.row, timestamp: h.timestamp })),
    ...loopCardRows.map((l) => ({ kind: "loop-card" as const, row: l.row, timestamp: l.timestamp })),
    ...loopProposalRows.map((l) => ({ kind: "loop-proposal" as const, row: l.row, timestamp: l.timestamp })),
    ...chainEditProposalRows.map((c) => ({ kind: "chain-edit-proposal" as const, row: c.row, timestamp: c.timestamp })),
    ...siblingOfferRows.map((s) => ({ kind: "sibling-offer" as const, row: s.row, timestamp: s.timestamp })),
    ...failureDiagnosisRows.map((d) => ({ kind: "failure-diagnosis" as const, row: d.row, timestamp: d.timestamp })),
  ];
  merged.sort((a, b) => a.timestamp - b.timestamp);

  for (const item of merged) {
    if (item.kind === "handoff") {
      rows.push(item.row);
    } else if (item.kind === "loop-card") {
      rows.push(item.row);
    } else if (item.kind === "loop-proposal") {
      rows.push(item.row);
    } else if (item.kind === "chain-edit-proposal") {
      rows.push(item.row);
    } else if (item.kind === "sibling-offer") {
      rows.push(item.row);
    } else if (item.kind === "failure-diagnosis") {
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
  const [loopSummonMessages, setLoopSummonMessages] = useState<TranscriptMessage[]>([]);
  const [loopProposalMessages, setLoopProposalMessages] = useState<TranscriptMessage[]>([]);
  const [chainEditProposalMessages, setChainEditProposalMessages] = useState<TranscriptMessage[]>([]);
  const [siblingOfferMessages, setSiblingOfferMessages] = useState<TranscriptMessage[]>([]);
  const [failureDiagnosisMessages, setFailureDiagnosisMessages] = useState<TranscriptMessage[]>([]);
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
      const systemNotes = messages.filter(isSystemNoteMessage);
      const handoffs = systemNotes.filter((m) => !isLoopSummonMessage(m) && !isLoopProposalMessage(m) && !isChainEditProposalMessage(m) && !isSiblingOfferMessage(m) && !isFailureDiagnosisMessage(m));
      const loopSummons = systemNotes.filter(isLoopSummonMessage);
      const loopProposals = systemNotes.filter(isLoopProposalMessage);
      const chainEditProposals = systemNotes.filter(isChainEditProposalMessage);
      const siblingOffers = systemNotes.filter(isSiblingOfferMessage);
      const failureDiagnoses = systemNotes.filter(isFailureDiagnosisMessage);
      setTurns(hydratedTurns);
      setHandoffMessages(handoffs);
      setLoopSummonMessages(loopSummons);
      setLoopProposalMessages(loopProposals);
      setChainEditProposalMessages(chainEditProposals);
      setSiblingOfferMessages(siblingOffers);
      setFailureDiagnosisMessages(failureDiagnoses);
      setRows(buildRowsFromTurns(hydratedTurns, handoffs, loopSummons, loopProposals, chainEditProposals, siblingOffers, failureDiagnoses));
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
    const newRows = buildRowsFromTurns(newTurns, handoffMessages, loopSummonMessages, loopProposalMessages, chainEditProposalMessages, siblingOfferMessages, failureDiagnosisMessages);
    setRows(newRows);
    return newRows;
  }, [handoffMessages, loopSummonMessages, loopProposalMessages, chainEditProposalMessages, siblingOfferMessages, failureDiagnosisMessages]);

  // Rebuild rows when handoffMessages, loopSummonMessages, loopProposalMessages, chainEditProposalMessages, siblingOfferMessages, or failureDiagnosisMessages changes
  useEffect(() => {
    const newRows = buildRowsFromTurns(turnsRef.current, handoffMessages, loopSummonMessages, loopProposalMessages, chainEditProposalMessages, siblingOfferMessages, failureDiagnosisMessages);
    setRows(newRows);
  }, [handoffMessages, loopSummonMessages, loopProposalMessages, chainEditProposalMessages, siblingOfferMessages, failureDiagnosisMessages]);

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

  /**
   * Insert loop cards into the transcript when the user clicks a
   * loop-summary-bar segment. Each call creates a persisted "loop-summon"
   * system message (role "user", id starting with "loop-summon-") whose
   * content is JSON { loopIds, environmentId }. The buildRowsFromTurns
   * function hydrates these into LoopCardRow entries on reload.
   */
  const insertLoopCards = useCallback(
    (loopIds: string[], environmentId: string) => {
      if (!sessionId || loopIds.length === 0) return;

      const timestamp = Date.now();
      const summonId = `loop-summon-${timestamp}`;

      const message: Omit<TranscriptMessage, "createdAt"> = {
        id: summonId,
        sessionId,
        role: "user",
        content: JSON.stringify({ loopIds, environmentId }),
        startedAt: timestamp,
        finishedAt: timestamp,
        environmentId,
      };

      // Persist the summon message
      void transcriptService.appendMessage(message).then((persisted) => {
        // Add to local state so the UI updates immediately
        setLoopSummonMessages((prev) => [...prev, persisted]);
      });
    },
    [sessionId, transcriptService],
  );

  /**
   * Insert a failure diagnosis into the transcript. This creates a persisted
   * "failure-diagnosis" system message (role "user", id starting with "failure-diagnosis-")
   * whose content is JSON with the diagnosis fields.
   * The timestamp is set to match the loop-summon timestamp so the diagnosis
   * row appears right after the associated loop card (1ms later for ordering).
   */
  const insertFailureDiagnosis = useCallback(
    (params: {
      loopId: string;
      environmentId: string;
      category: FailureCategory;
      summary: string;
      nextStep: string;
      confidence: "high" | "medium" | "low";
      /** The timestamp of the parent loop-summon message, for ordering. */
      summonTimestamp: number;
    }) => {
      if (!sessionId) return;

      const messageId = `failure-diagnosis-${params.summonTimestamp}-${params.loopId}`;

      const message: Omit<TranscriptMessage, "createdAt"> = {
        id: messageId,
        sessionId,
        role: "user",
        content: JSON.stringify({
          kind: "failure-diagnosis",
          loopId: params.loopId,
          environmentId: params.environmentId,
          category: params.category,
          summary: params.summary,
          nextStep: params.nextStep,
          confidence: params.confidence,
        }),
        startedAt: params.summonTimestamp,
        finishedAt: params.summonTimestamp,
        environmentId: params.environmentId,
      };

      // Persist the diagnosis message
      void transcriptService.appendMessage(message).then((persisted) => {
        setFailureDiagnosisMessages((prev) => [...prev, persisted]);
      });
    },
    [sessionId, transcriptService],
  );

  /**
   * Insert a loop proposal into the transcript. This creates a persisted
   * "loop-proposal" system message (role "user", id starting with "loop-proposal-")
   * whose content is JSON with the proposal fields.
   */
  const insertLoopProposal = useCallback(
    (proposal: Omit<LoopProposalRow, "id" | "kind" | "turnId">) => {
      if (!sessionId) return;

      const timestamp = Date.now();
      const proposalId = proposal.proposalId ?? `lp-${timestamp}`;
      const messageId = `loop-proposal-${timestamp}`;

      const message: Omit<TranscriptMessage, "createdAt"> = {
        id: messageId,
        sessionId,
        role: "user",
        content: JSON.stringify({
          kind: "loop-proposal",
          proposalId,
          command: proposal.command,
          commandArgs: proposal.commandArgs,
          interval: proposal.interval,
          projectId: proposal.projectId,
          projectName: proposal.projectName,
          runImmediately: proposal.runImmediately,
          maxRuns: proposal.maxRuns,
          suggestedMaxRuns: proposal.suggestedMaxRuns,
          environmentId: proposal.environmentId,
          status: proposal.status ?? "pending",
          createdLoopId: proposal.createdLoopId,
          error: proposal.error,
          provenance: proposal.provenance ?? null,
          adaptedFrom: proposal.adaptedFrom ?? null,
        }),
        startedAt: timestamp,
        finishedAt: timestamp,
        environmentId: proposal.environmentId,
      };

      // Persist the proposal message
      void transcriptService.appendMessage(message).then((persisted) => {
        setLoopProposalMessages((prev) => [...prev, persisted]);
      });
    },
    [sessionId, transcriptService],
  );

  /**
   * Update a loop proposal's status in the persisted transcript.
   * Finds and updates the corresponding loop-proposal message content.
   */
  const updateLoopProposalStatus = useCallback(
    (proposalId: string, status: LoopProposalStatus, extras?: { createdLoopId?: string; error?: string }) => {
      if (!sessionId) return;

      setLoopProposalMessages((prev) => {
        const updated = prev.map((msg) => {
          if (!msg.id.startsWith("loop-proposal-")) return msg;
          try {
            const parsed = JSON.parse(msg.content);
            if (parsed.proposalId !== proposalId) return msg;
            const newParsed = {
              ...parsed,
              status,
              ...(extras?.createdLoopId != null ? { createdLoopId: extras.createdLoopId } : {}),
              ...(extras?.error != null ? { error: extras.error } : {}),
            };
            const newContent = JSON.stringify(newParsed);
            // Persist the update
            void transcriptService.updateMessage(msg.id, { content: newContent });
            return { ...msg, content: newContent };
          } catch {
            return msg;
          }
        });
        return updated;
      });
    },
    [sessionId, transcriptService],
  );

  /**
   * Insert a chain-edit proposal into the transcript. This creates a persisted
   * "chain-edit-proposal" system message (role "user", id starting with "chain-edit-proposal-")
   * whose content is JSON with the proposal fields including proposedSteps and operationSummaries.
   */
  const insertChainEditProposal = useCallback(
    (proposal: Omit<ChainEditProposalRow, "id" | "kind" | "turnId">) => {
      if (!sessionId) return;

      const timestamp = Date.now();
      const proposalId = proposal.proposalId ?? `cep-${timestamp}`;
      const messageId = `chain-edit-proposal-${timestamp}`;

      const message: Omit<TranscriptMessage, "createdAt"> = {
        id: messageId,
        sessionId,
        role: "user",
        content: JSON.stringify({
          kind: "chain-edit-proposal",
          proposalId,
          loopId: proposal.loopId,
          environmentId: proposal.environmentId,
          proposedSteps: proposal.proposedSteps,
          operationSummaries: proposal.operationSummaries,
          status: proposal.status ?? "pending",
          error: proposal.error,
          sharedTaskWarning: proposal.sharedTaskWarning,
        }),
        startedAt: timestamp,
        finishedAt: timestamp,
        environmentId: proposal.environmentId,
      };

      // Persist the proposal message
      void transcriptService.appendMessage(message).then((persisted) => {
        setChainEditProposalMessages((prev) => [...prev, persisted]);
      });
    },
    [sessionId, transcriptService],
  );

  /**
   * Update a chain-edit proposal's status in the persisted transcript.
   * Finds and updates the corresponding chain-edit-proposal message content.
   */
  const updateChainEditProposalStatus = useCallback(
    (proposalId: string, status: ChainEditProposalStatus, extras?: { error?: string }) => {
      if (!sessionId) return;

      setChainEditProposalMessages((prev) => {
        const updated = prev.map((msg) => {
          if (!msg.id.startsWith("chain-edit-proposal-")) return msg;
          try {
            const parsed = JSON.parse(msg.content);
            if (parsed.proposalId !== proposalId) return msg;
            const newParsed = {
              ...parsed,
              status,
              ...(extras?.error != null ? { error: extras.error } : {}),
            };
            const newContent = JSON.stringify(newParsed);
            // Persist the update
            void transcriptService.updateMessage(msg.id, { content: newContent });
            return { ...msg, content: newContent };
          } catch {
            return msg;
          }
        });
        return updated;
      });
    },
    [sessionId, transcriptService],
  );

  /**
   * Update the fork decision on a chain-edit proposal's shared-task warning.
   * The decision ("change-all" | "fork-copy") is stored inside the
   * sharedTaskWarning object within the persisted chain-edit-proposal message.
   */
  const updateChainEditProposalForkDecision = useCallback(
    (proposalId: string, decision: "change-all" | "fork-copy") => {
      if (!sessionId) return;

      setChainEditProposalMessages((prev) => {
        const updated = prev.map((msg) => {
          if (!msg.id.startsWith("chain-edit-proposal-")) return msg;
          try {
            const parsed = JSON.parse(msg.content);
            if (parsed.proposalId !== proposalId) return msg;
            const newParsed = {
              ...parsed,
              sharedTaskWarning: {
                ...(parsed.sharedTaskWarning ?? {}),
                decision,
              },
            };
            const newContent = JSON.stringify(newParsed);
            // Persist the update
            void transcriptService.updateMessage(msg.id, { content: newContent });
            return { ...msg, content: newContent };
          } catch {
            return msg;
          }
        });
        return updated;
      });
    },
    [sessionId, transcriptService],
  );

  /**
   * Insert a sibling offer into the transcript. This creates a persisted
   * "sibling-offer" system message (role "user", id starting with "sibling-offer-")
   * whose content is JSON with the offer fields.
   */
  const insertSiblingOffer = useCallback(
    (offer: Omit<SiblingOfferRow, "id" | "kind" | "turnId">) => {
      if (!sessionId) return;

      const timestamp = Date.now();
      const offerId = offer.offerId ?? `so-${timestamp}`;
      const messageId = `sibling-offer-${timestamp}`;

      const message: Omit<TranscriptMessage, "createdAt"> = {
        id: messageId,
        sessionId,
        role: "user",
        content: JSON.stringify({
          kind: "sibling-offer",
          offerId,
          siblingLoopId: offer.siblingLoopId,
          siblingEnvironmentId: offer.siblingEnvironmentId,
          siblingEnvironmentName: offer.siblingEnvironmentName,
          siblingLoopDescription: offer.siblingLoopDescription,
          structuralDiff: offer.structuralDiff,
          status: offer.status ?? "pending",
          error: offer.error,
        }),
        startedAt: timestamp,
        finishedAt: timestamp,
        environmentId: offer.siblingEnvironmentId,
      };

      // Persist the offer message
      void transcriptService.appendMessage(message).then((persisted) => {
        setSiblingOfferMessages((prev) => [...prev, persisted]);
      });
    },
    [sessionId, transcriptService],
  );

  /**
   * Update a sibling offer's status in the persisted transcript.
   * Finds and updates the corresponding sibling-offer message content.
   */
  const updateSiblingOfferStatus = useCallback(
    (offerId: string, status: SiblingOfferStatus, extras?: { error?: string }) => {
      if (!sessionId) return;

      setSiblingOfferMessages((prev) => {
        const updated = prev.map((msg) => {
          if (!msg.id.startsWith("sibling-offer-")) return msg;
          try {
            const parsed = JSON.parse(msg.content);
            if (parsed.offerId !== offerId) return msg;
            const newParsed = {
              ...parsed,
              status,
              ...(extras?.error != null ? { error: extras.error } : {}),
            };
            const newContent = JSON.stringify(newParsed);
            // Persist the update
            void transcriptService.updateMessage(msg.id, { content: newContent });
            return { ...msg, content: newContent };
          } catch {
            return msg;
          }
        });
        return updated;
      });
    },
    [sessionId, transcriptService],
  );

  /** Force a reload of the transcript from the persistence layer. */
  const reloadTranscript = useCallback(() => {
    if (!sessionId) return;
    loadedSessionRef.current = null;
    loadingRef.current = false;
    transcriptService.getMessages(sessionId).then((messages) => {
      const hydratedTurns = messagesToChatTurns(messages);
      const systemNotes = messages.filter(isSystemNoteMessage);
      const handoffs = systemNotes.filter((m) => !isLoopSummonMessage(m) && !isLoopProposalMessage(m) && !isChainEditProposalMessage(m) && !isSiblingOfferMessage(m) && !isFailureDiagnosisMessage(m));
      const loopSummons = systemNotes.filter(isLoopSummonMessage);
      const loopProposals = systemNotes.filter(isLoopProposalMessage);
      const chainEditProposals = systemNotes.filter(isChainEditProposalMessage);
      const siblingOffers = systemNotes.filter(isSiblingOfferMessage);
      const failureDiagnoses = systemNotes.filter(isFailureDiagnosisMessage);
      setTurns(hydratedTurns);
      setHandoffMessages(handoffs);
      setLoopSummonMessages(loopSummons);
      setLoopProposalMessages(loopProposals);
      setChainEditProposalMessages(chainEditProposals);
      setSiblingOfferMessages(siblingOffers);
      setFailureDiagnosisMessages(failureDiagnoses);
      setRows(buildRowsFromTurns(hydratedTurns, handoffs, loopSummons, loopProposals, chainEditProposals, siblingOffers, failureDiagnoses));
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
    insertLoopCards,
    insertFailureDiagnosis,
    insertLoopProposal,
    updateLoopProposalStatus,
    insertChainEditProposal,
    updateChainEditProposalStatus,
    updateChainEditProposalForkDecision,
    insertSiblingOffer,
    updateSiblingOfferStatus,
    reloadTranscript,
  };
}
