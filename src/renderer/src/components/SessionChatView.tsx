import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { cid, useInject } from "inversify-hooks";
import type { ChatTurn, AccessMode, ApprovalDecision, ToolCall } from "../chat/types";
import type { AgentStreamEvent, ReasoningEffort } from "../../../shared/ipc";
import type { IAgentService, ITranscriptService } from "../services/interfaces";
import { useTranscript } from "../chat/useTranscript";
import { ChatComposer } from "../chat/ChatComposer";

const MarkdownContent = lazy(() =>
  import("../chat/MarkdownContent").then((m) => ({ default: m.MarkdownContent })),
);
import { ToolCallInlineBlock } from "../chat/ToolCallInlineBlock";
import { ToolCallsExpander } from "../chat/ToolCallsExpander";
import { TurnFold } from "../chat/TurnFold";

interface SessionChatViewProps {
  sessionId: string;
  environmentId: string;
  activeRuntime: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  environments: Array<{ id: string; name: string }>;
}

export function SessionChatView({ sessionId, environmentId, activeRuntime, model, reasoningEffort, environments }: SessionChatViewProps): React.ReactNode {
  const intl = useIntl();
  const [agentService] = useInject<IAgentService>(cid.IAgentService);
  const [transcriptService] = useInject<ITranscriptService>(cid.ITranscriptService);
  const {
    turns,
    rows,
    toggleTurnCollapse,
    toggleToolExpand,
    expandAllTurns,
    addTurn,
    appendAssistantContent,
    finishTurn,
    interruptTurn,
    reloadTranscript,
  } = useTranscript(sessionId);

  const [accessMode, setAccessMode] = useState<AccessMode>("full");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [opencodeSessionId, setOpenCodeSessionId] = useState<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialEnvRef = useRef<string | null>(null);

  // ── Clear active turn and reload transcript on instance switch ───
  // When the environmentId changes (instance switch), any in-flight
  // streaming from the old instance should be abandoned and the transcript
  // should be reloaded to pick up the handoff divider message.
  // Skip on initial mount (no switch has occurred yet).
  useEffect(() => {
    if (initialEnvRef.current === null) {
      initialEnvRef.current = environmentId;
      return;
    }
    if (initialEnvRef.current === environmentId) return;
    initialEnvRef.current = environmentId;
    setActiveTurnId(null);
    if (sessionId) {
      reloadTranscript();
    }
  }, [environmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll on new content ──────────────────────────────────────

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [rows]);

  // ── Stream event subscription ───────────────────────────────────────

  useEffect(() => {
    const unsubscribe = agentService.onStreamEvent((event: AgentStreamEvent) => {
      switch (event.kind) {
        case "text-delta":
          appendAssistantContent(event.turnId, event.text);
          break;

        case "tool-call-start": {
          const turn = turns.find((t) => t.id === event.turnId);
          if (turn) {
            const newToolCall: ToolCall = {
              id: event.toolCallId,
              kind: event.toolName,
              title: event.title,
              status: "running",
              startedAt: Date.now(),
            };
            const updatedToolCalls = [...(turn.assistantMessage.toolCalls ?? []), newToolCall];
            void transcriptService.updateMessage(turn.assistantMessage.id, {
              toolCalls: updatedToolCalls.map((tc) => ({
                id: tc.id,
                kind: tc.kind,
                title: tc.title,
                status: tc.status,
                output: tc.output,
                startedAt: tc.startedAt,
                finishedAt: tc.finishedAt,
              })),
            });
          }
          break;
        }

        case "tool-call-output": {
          const turn = turns.find((t) => t.id === event.turnId);
          if (turn) {
            const updatedToolCalls = (turn.assistantMessage.toolCalls ?? []).map((tc) =>
              tc.id === event.toolCallId
                ? { ...tc, status: event.status as "completed" | "error", output: event.output, finishedAt: Date.now() }
                : tc,
            );
            void transcriptService.updateMessage(turn.assistantMessage.id, {
              toolCalls: updatedToolCalls.map((tc) => ({
                id: tc.id,
                kind: tc.kind,
                title: tc.title,
                status: tc.status,
                output: tc.output,
                startedAt: tc.startedAt,
                finishedAt: tc.finishedAt,
              })),
            });
          }
          break;
        }

        case "turn-finished":
          finishTurn(event.turnId);
          setActiveTurnId(null);
          break;

        case "turn-error":
          finishTurn(event.turnId);
          setActiveTurnId(null);
          break;

        case "turn-interrupted":
          interruptTurn(event.turnId);
          setActiveTurnId(null);
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [agentService, appendAssistantContent, finishTurn, interruptTurn, turns, transcriptService]);

  // ── Send prompt handler ─────────────────────────────────────────────

  const handleSendPrompt = useCallback(
    (text: string) => {
      const timestamp = Date.now();
      const turnId = `agent-turn-${timestamp}`;
      const userMsgId = `agent-msg-${timestamp}-u`;
      const assistantMsgId = `agent-msg-${timestamp}-a`;

      const turn: ChatTurn = {
        id: turnId,
        userMessage: {
          id: userMsgId,
          role: "user",
          content: text,
          startedAt: timestamp,
          environmentId,
        },
        assistantMessage: {
          id: assistantMsgId,
          role: "assistant",
          content: "",
          toolCalls: [],
          startedAt: timestamp + 1,
          finishedAt: undefined,
          environmentId,
        },
        finished: false,
        collapsed: false,
        accessMode,
      };

      addTurn(turn);
      setActiveTurnId(turnId);

      void agentService
        .sendPrompt({
          environmentId,
          prompt: text,
          sessionId: opencodeSessionId,
          chatSessionId: sessionId,
          turnId,
          model,
          reasoningEffort,
        })
        .then((result) => {
          if (result.ok && result.sessionId) {
            setOpenCodeSessionId(result.sessionId);
          } else if (!result.ok) {
            const errorMsg = typeof result.error === "string"
              ? result.error
              : intl.formatMessage({ id: "agent.promptError" });
            appendAssistantContent(turnId, errorMsg);
            finishTurn(turnId);
            setActiveTurnId(null);
          }
        });
    },
    [accessMode, addTurn, agentService, appendAssistantContent, environmentId, finishTurn, intl, opencodeSessionId, sessionId, model, reasoningEffort],
  );

  // ── Interrupt handler ───────────────────────────────────────────────

  const handleInterrupt = useCallback(
    (turnId: string) => {
      interruptTurn(turnId);
      setActiveTurnId(null);
      void agentService.interrupt(environmentId, opencodeSessionId);
    },
    [agentService, environmentId, interruptTurn, opencodeSessionId],
  );

  // ── Other handlers ──────────────────────────────────────────────────

  const handleResolveApproval = useCallback(
    (_approvalId: string, _decision: ApprovalDecision) => {
      // Agent approvals are handled by the OpenCode runtime, not locally
    },
    [],
  );

  const handleAnswerQuestion = useCallback(
    (_questionId: string, _answer: string) => {
      // Agent questions are handled by the OpenCode runtime, not locally
    },
    [],
  );

  const handleAccessModeChange = useCallback(
    (mode: AccessMode) => {
      setAccessMode(mode);
    },
    [],
  );

  const handleDraftChange = useCallback(
    (turnId: string | null, text: string) => {
      const key = turnId ?? "__session-new";
      setDrafts((prev) => ({ ...prev, [key]: text }));
    },
    [],
  );

  return (
    <div className="session-chat-panel">
      <div className="session-chat-scroll" ref={scrollRef}>
        {rows.length === 0 ? (
          <div className="session-chat-empty">
            <p>{intl.formatMessage({ id: "session.emptyDescription" })}</p>
          </div>
        ) : (
          rows.map((row) => {
            switch (row.kind) {
              case "user-message":
                return (
                  <div key={row.id} className="transcript-user-msg">
                    <div className="transcript-avatar session-user-avatar">{intl.formatMessage({ id: "session.userInitials" })}</div>
                    <div className="transcript-msg-body">
                      <Suspense fallback={null}>
                        <MarkdownContent content={row.content} />
                      </Suspense>
                    </div>
                  </div>
                );
              case "assistant-message": {
                const envName = row.environmentId
                  ? environments.find((e) => e.id === row.environmentId)?.name
                  : undefined;
                return (
                  <div key={row.id} className="transcript-assistant-msg">
                    <div className="transcript-avatar session-assistant-avatar">{activeRuntime === "claude" ? "CC" : "OC"}</div>
                    <div className="transcript-msg-body">
                      <Suspense fallback={null}>
                        <MarkdownContent content={row.content} streaming={row.streaming} />
                      </Suspense>
                      {envName ? (
                        <span className="transcript-instance-attribution">
                          {intl.formatMessage({ id: "instanceAttribution.label" }, { instance: envName })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              }
              case "tool-call":
                return (
                  <ToolCallInlineBlock
                    key={row.id}
                    rowId={row.id}
                    toolCall={row.toolCall}
                    expanded={row.expanded}
                    onToggleExpand={toggleToolExpand}
                  />
                );
              case "tool-calls-expander":
                return (
                  <ToolCallsExpander
                    key={row.id}
                    count={row.count}
                    onClick={() => expandAllTurns()}
                  />
                );
              case "turn-fold":
                return (
                  <TurnFold
                    key={row.id}
                    toolCallCount={row.toolCallCount}
                    durationSec={row.durationSec}
                    onClick={() => toggleTurnCollapse(row.turnId)}
                  />
                );
              case "approval-request":
              case "question-request":
                // Agent approvals/questions are handled by the OpenCode runtime.
                return null;
              case "instance-handoff":
                return (
                  <div key={row.id} className="transcript-instance-handoff">
                    <span className="transcript-handoff-line" />
                    <span className="transcript-handoff-text">
                      {intl.formatMessage(
                        { id: "instanceHandoff.label" },
                        { fromInstance: row.fromInstance, toInstance: row.toInstance },
                      )}
                    </span>
                    <span className="transcript-handoff-line" />
                  </div>
                );
              default:
                return null;
            }
          })
        )}
      </div>

      <ChatComposer
        turns={turns}
        activeTurnId={activeTurnId}
        onSendPrompt={handleSendPrompt}
        onInterrupt={handleInterrupt}
        onResolveApproval={handleResolveApproval}
        onAnswerQuestion={handleAnswerQuestion}
        accessMode={accessMode}
        onAccessModeChange={handleAccessModeChange}
        drafts={drafts}
        onDraftChange={handleDraftChange}
      />
    </div>
  );
}
