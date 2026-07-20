import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { cid, useInject } from "inversify-hooks";
import type { ChatTurn, AccessMode, ApprovalDecision, ToolCall, ChainEditProposalStatus, ChainEditOperationSummary, LoopProposalStatus, SharedTaskWarning } from "../chat/types";
import type { AgentStreamEvent, ReasoningEffort, ReachabilityState } from "../../../shared/ipc";
import type { IAgentService, IMcpService, ITranscriptService } from "../services/interfaces";
import type { LoopMeta, Environment } from "../types";
import { useTranscript } from "../chat/useTranscript";
import { diagnoseFailure } from "../chat/diagnoseFailure";
import { ChatComposer } from "../chat/ChatComposer";
import { LoopSummaryBar, type LoopSegmentKind } from "./LoopSummaryBar";
import { LoopCard } from "./LoopCard";
import { LoopProposalCard } from "./LoopProposalCard";
import { ChainEditProposalCard } from "./ChainEditProposalCard";
import { FailureDiagnosisPanel } from "./FailureDiagnosisPanel";
import { WifiOff } from "lucide-react";
import { fetchLogs } from "../api";

const MarkdownContent = lazy(() =>
  import("../chat/MarkdownContent").then((m) => ({ default: m.MarkdownContent })),
);
import { ToolCallInlineBlock } from "../chat/ToolCallInlineBlock";
import { ToolCallsExpander } from "../chat/ToolCallsExpander";
import { TurnFold } from "../chat/TurnFold";

// ── Shared-task detection ──────────────────────────────────────────────────

/**
 * Detect whether a chain-edit proposal modifies a task that is shared by
 * loops other than the one being edited.
 *
 * A task is "shared" when:
 * - It is the `taskId` on another loop, OR
 * - It is reachable via `onSuccessTaskId` / `onFailureTaskId` chains from
 *   another loop's task.
 *
 * Returns a `SharedTaskWarning` if any `update-task` operations in the
 * proposal target shared tasks, or `undefined` if no sharing is detected.
 */
function detectSharedTaskWarning(
  editedLoopId: string,
  operationSummaries: ChainEditOperationSummary[],
  allLoops: LoopMeta[],
): SharedTaskWarning | undefined {
  // Only "update-task" operations can modify shared tasks
  const updateOps = operationSummaries.filter((op) => op.kind === "update-task");
  if (updateOps.length === 0) return undefined;

  // Collect all task IDs referenced by other loops.
  // For each loop's taskId, walk the chain (onSuccess/onFailure) to find
  // all transitively referenced task IDs. Since we don't have the full task
  // definitions here (they're on the daemon), we rely on the loop's taskId
  // as the entry point. The "shared" check is: is the taskId of another loop
  // the same as a task being updated?
  //
  // We can only check direct taskId references at this level. Deeper chain
  // references (onSuccessTaskId / onFailureTaskId) require fetching tasks
  // from the daemon, which is asynchronous and not suitable for inline
  // detection in the stream event handler. The MCP tool on the daemon side
  // performs the full transitive check and includes sharedTaskWarning data
  // in the proposal payload if deeper sharing exists.

  // Best-effort: check if any other loop references the same taskId as
  // the edited loop. This catches the common case of shared entry-point tasks.
  const editedLoop = allLoops.find((l) => l.id === editedLoopId);
  const editedTaskId = editedLoop?.taskId;
  if (!editedTaskId) return undefined;

  const referencingLoops: Array<{ loopId: string; loopName: string }> = [];

  for (const loop of allLoops) {
    if (loop.id === editedLoopId) continue;
    if (loop.taskId === editedTaskId) {
      referencingLoops.push({
        loopId: loop.id,
        loopName: loop.description?.trim() || loop.id,
      });
    }
  }

  if (referencingLoops.length === 0) return undefined;

  return {
    taskIds: [editedTaskId],
    referencingLoops,
    decision: null,
  };
}

interface SessionChatViewProps {
  sessionId: string;
  environmentId: string;
  environmentName: string;
  activeRuntime: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  environments: Array<{ id: string; name: string }>;
  reachability?: ReachabilityState;
  /** Loops scoped to the session's home project x instance, for the summary bar. */
  loops: LoopMeta[];
  /** All per-environment loops, for resolving loop-card rows. */
  perEnvLoops: Record<string, LoopMeta[]>;
  /** The full environment instance, for log tail in loop cards. */
  instance?: Environment;
}

export function SessionChatView({ sessionId, environmentId, environmentName, activeRuntime, model, reasoningEffort, environments, reachability, loops, perEnvLoops, instance }: SessionChatViewProps): React.ReactNode {
  const intl = useIntl();
  const [agentService] = useInject<IAgentService>(cid.IAgentService);
  const [mcpService] = useInject<IMcpService>(cid.IMcpService);
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
    insertLoopCards,
    insertFailureDiagnosis,
    insertLoopProposal,
    updateLoopProposalStatus,
    insertChainEditProposal,
    updateChainEditProposalStatus,
    updateChainEditProposalForkDecision,
  } = useTranscript(sessionId);

  const [accessMode, setAccessMode] = useState<AccessMode>("full");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [opencodeSessionId, setOpenCodeSessionId] = useState<string | undefined>(undefined);
  const [chainVersion, setChainVersion] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialEnvRef = useRef<string | null>(null);

  // ── Reachability ──────────────────────────────────────────────────────
  const isReachable = reachability === "connected" || reachability === undefined;

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

            // ── Intercept chain-edit-proposal payloads from MCP tool output ──
            // When the agent's MCP tool call returns a payload with
            // `chainEditProposal: true`, parse it and insert a
            // chain-edit-proposal row into the transcript for user approval.
            // If the proposal modifies a task shared by other loops, include
            // a SharedTaskWarning so the user can choose to fork or apply globally.
            if (event.status === "completed" && event.output) {
              try {
                const parsed = JSON.parse(event.output);
                if (parsed && parsed.chainEditProposal === true) {
                  const loopId = parsed.loopId ?? "";
                  const operationSummaries = Array.isArray(parsed.operationSummaries) ? parsed.operationSummaries as ChainEditOperationSummary[] : [];

                  // Detect shared-task references: check if any "update-task" operation
                  // targets a task that's referenced by other loops
                  const sharedTaskWarning = detectSharedTaskWarning(
                    loopId,
                    operationSummaries,
                    loops,
                  );

                  insertChainEditProposal({
                    proposalId: parsed.proposalId ?? `cep-${Date.now()}`,
                    loopId,
                    environmentId: parsed.environmentId ?? environmentId,
                    proposedSteps: Array.isArray(parsed.proposedSteps) ? parsed.proposedSteps : [],
                    operationSummaries,
                    status: "pending",
                    error: null,
                    sharedTaskWarning,
                  });
                }
              } catch {
                // Output is not JSON or doesn't contain a chain-edit proposal, ignore
              }
            }
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

  // ── Loop-bar segment click → summon matching loop cards ──────────────

  /**
   * After inserting loop cards, also produce failure diagnoses for any
   * failed loops that appear in the summon. Fetches log tails, runs the
   * local heuristic classifier, and inserts diagnosis rows.
   */
  const diagnoseAndInsert = useCallback(
    async (failedLoops: LoopMeta[], envId: string, summonTimestamp: number) => {
      if (!instance || failedLoops.length === 0) return;
      for (const loop of failedLoops) {
        try {
          const logRes = await fetchLogs(instance, loop.id, 20);
          const logTail = logRes.ok && typeof logRes.data === "string" ? logRes.data : "";
          const diagnosis = diagnoseFailure(loop, logTail);
          insertFailureDiagnosis({
            loopId: loop.id,
            environmentId: envId,
            category: diagnosis.category,
            summary: diagnosis.summary,
            nextStep: diagnosis.nextStep,
            confidence: diagnosis.confidence,
            summonTimestamp,
          });
        } catch {
          // If log fetch fails, insert a generic diagnosis
          const diagnosis = diagnoseFailure(loop, "");
          insertFailureDiagnosis({
            loopId: loop.id,
            environmentId: envId,
            category: diagnosis.category,
            summary: diagnosis.summary,
            nextStep: diagnosis.nextStep,
            confidence: diagnosis.confidence,
            summonTimestamp,
          });
        }
      }
    },
    [instance, insertFailureDiagnosis],
  );

  const handleSegmentClick = useCallback(
    (kind: LoopSegmentKind) => {
      // Map the segment kind to the matching loop IDs
      const matchingLoops = kind === "healthy"
        ? loops.filter((l) => l.status === "running" || l.status === "waiting")
        : loops.filter((l) => l.status === kind);

      if (matchingLoops.length > 0) {
        const timestamp = Date.now();
        insertLoopCards(
          matchingLoops.map((l) => l.id),
          environmentId,
        );

        // Auto-diagnose failed loops
        const failedLoops = matchingLoops.filter((l) => l.status === "failed");
        if (failedLoops.length > 0) {
          void diagnoseAndInsert(failedLoops, environmentId, timestamp);
        }
      }
    },
    [loops, environmentId, insertLoopCards, diagnoseAndInsert],
  );

  // ── Loop proposal callbacks ───────────────────────────────────────────

  const handleProposalApproved = useCallback(
    (proposalId: string, loopId: string, envId: string) => {
      updateLoopProposalStatus(proposalId, "created", { createdLoopId: loopId });
      // Insert a live loop card for the newly created loop
      insertLoopCards([loopId], envId);
    },
    [updateLoopProposalStatus, insertLoopCards],
  );

  const handleProposalRejected = useCallback(
    (proposalId: string) => {
      updateLoopProposalStatus(proposalId, "rejected");
    },
    [updateLoopProposalStatus],
  );

  const handleProposalStatusChange = useCallback(
    (proposalId: string, status: LoopProposalStatus, error?: string) => {
      updateLoopProposalStatus(proposalId, status, error ? { error } : undefined);
    },
    [updateLoopProposalStatus],
  );

  // ── Chain edit proposal callbacks ───────────────────────────────────────

  const handleChainEditApproved = useCallback(
    (proposalId: string, loopId: string, envId: string) => {
      // Find the proposal row to extract the fork decision
      const chainEditRow = rows.find(
        (r): r is import("../chat/types").ChainEditProposalRow =>
          r.kind === "chain-edit-proposal" && r.proposalId === proposalId,
      );
      const forkStrategy = chainEditRow?.sharedTaskWarning?.decision ?? "change-all";

      // Apply the chain edit by calling the MCP service with an apply flag.
      // The MCP tool that produced the proposal will re-execute with the
      // apply flag set, actually creating/updating the tasks on the daemon.
      // If forkStrategy is "fork-copy", the daemon creates a new copy of
      // any shared task and re-points only this loop's chain.
      void mcpService.callTool(envId, "apply_chain_edit", { proposalId, loopId, forkStrategy }).then((result) => {
        if (result.ok) {
          updateChainEditProposalStatus(proposalId, "applied");
          // Invalidate chain cache so the LoopCard re-fetches tasks on next expand
          setChainVersion((prev) => prev + 1);
        } else {
          const errorMsg = typeof result.error === "string"
            ? result.error
            : intl.formatMessage({ id: "chainEditProposal.applyError" });
          updateChainEditProposalStatus(proposalId, "error", { error: errorMsg });
        }
      }).catch(() => {
        updateChainEditProposalStatus(proposalId, "error", {
          error: intl.formatMessage({ id: "chainEditProposal.applyError" }),
        });
      });
    },
    [mcpService, updateChainEditProposalStatus, intl, rows],
  );

  const handleChainEditRejected = useCallback(
    (proposalId: string) => {
      updateChainEditProposalStatus(proposalId, "rejected");
    },
    [updateChainEditProposalStatus],
  );

  const handleChainEditStatusChange = useCallback(
    (proposalId: string, status: ChainEditProposalStatus, error?: string) => {
      updateChainEditProposalStatus(proposalId, status, error ? { error } : undefined);
    },
    [updateChainEditProposalStatus],
  );

  const handleChainEditForkDecision = useCallback(
    (proposalId: string, decision: "change-all" | "fork-copy") => {
      updateChainEditProposalForkDecision(proposalId, decision);
    },
    [updateChainEditProposalForkDecision],
  );

  return (
    <div className="session-chat-panel">
      {!isReachable ? (
        <div className="unreachable-banner">
          <WifiOff size={13} />
          {intl.formatMessage(
            { id: reachability === "reconnecting" ? "unreachableBanner.reconnecting" : "unreachableBanner.unreachable" },
            { instance: environmentName },
          )}
        </div>
      ) : null}
      <LoopSummaryBar loops={loops} reachability={reachability} onSegmentClick={handleSegmentClick} />
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
              case "loop-card": {
                const envLoops = perEnvLoops[row.environmentId] ?? loops;
                const loop = envLoops.find((l) => l.id === row.loopId);
                if (!loop) return null;
                return (
                  <div key={row.id} className="transcript-loop-card">
                    <LoopCard loop={loop} reachability={reachability} instance={instance} scrollContainerRef={scrollRef} chainVersion={chainVersion} />
                  </div>
                );
              }
              case "loop-proposal": {
                return (
                  <div key={row.id} className="transcript-loop-proposal">
                    <LoopProposalCard
                      row={row}
                      instance={instance}
                      onApproved={handleProposalApproved}
                      onRejected={handleProposalRejected}
                      onStatusChange={handleProposalStatusChange}
                    />
                  </div>
                );
              }
              case "chain-edit-proposal": {
                return (
                  <div key={row.id} className="transcript-chain-edit-proposal">
                    <ChainEditProposalCard
                      row={row}
                      instance={instance}
                      onApproved={handleChainEditApproved}
                      onRejected={handleChainEditRejected}
                      onStatusChange={handleChainEditStatusChange}
                      onForkDecision={handleChainEditForkDecision}
                    />
                  </div>
                );
              }
              case "failure-diagnosis": {
                return (
                  <div key={row.id} className="transcript-failure-diagnosis">
                    <FailureDiagnosisPanel row={row} />
                  </div>
                );
              }
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
        isReachable={isReachable}
      />
    </div>
  );
}
