import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { cid, useInject } from "inversify-hooks";
import type { ChatTurn, AccessMode, ApprovalDecision, ToolCall, ChainEditProposalStatus, ChainEditOperationSummary, LoopProposalStatus, SharedTaskWarning, SiblingOfferStatus, FleetPlanStatus, FleetPlanTarget } from "../chat/types";
import type { AgentStreamEvent, ReasoningEffort, ReachabilityState } from "../../../shared/ipc";
import type { IAgentService, IMcpService, ITranscriptService, IConfigService, IInfraService, ILoopShapeCacheService, ISiblingOfferService } from "../services/interfaces";
import type { LoopMeta, Environment, LoopWithOrigin, FleetLoopRollup } from "../types";
import type { StructuralOp } from "../../../shared/sibling-offer-types";
import { useTranscript } from "../chat/useTranscript";
import { diagnoseFailure } from "../chat/diagnoseFailure";
import { computeSimilarLoops } from "../fleet-similarity";
import { matchShapeToFleetIntent, adaptShapeForPlatform, buildProvenance } from "../fleet-shape-adapt";
import { detectStructuralChanges, findSiblingLoops, computeStructuralDiff, extractTopology } from "../fleet-structural-diff";
import { ChatComposer } from "../chat/ChatComposer";
import { LoopSummaryBar, type LoopSegmentKind } from "./LoopSummaryBar";
import { usePipelineCounts } from "./usePipelineCounts";
import { LoopCard } from "./LoopCard";
import { LoopProposalCard } from "./LoopProposalCard";
import { FleetShapedProposalCard } from "./FleetShapedProposalCard";
import { ChainEditProposalCard } from "./ChainEditProposalCard";
import { SiblingOfferCard } from "./SiblingOfferCard";
import { FleetPlanCard } from "./FleetPlanCard";
import { FailureDiagnosisPanel } from "./FailureDiagnosisPanel";
import { PrReferenceCard } from "./PrReferenceCard";
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

function buildFleetLoopsWithOrigin(
  perEnvLoops: Record<string, LoopMeta[]>,
  environments: Array<{ id: string; name: string }>,
  perEnvProjects: Record<string, import("../types").Project[]>,
  reachability: Record<string, ReachabilityState>,
): LoopWithOrigin[] {
  const result: LoopWithOrigin[] = [];
  for (const env of environments) {
    const state = reachability[env.id];
    if (state === "unreachable" || state === "reconnecting") continue;
    const envLoops = perEnvLoops[env.id] ?? [];
    const envProjects = perEnvProjects[env.id] ?? [];
    for (const loop of envLoops) {
      const project = envProjects.find((p) => p.id === (loop.projectId ?? "default"));
      result.push({
        loop,
        environmentId: env.id,
        environmentName: env.name,
        projectName: project?.name ?? "Default",
      });
    }
  }
  return result;
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
  /** Per-environment reachability map, for similar-loops computation. */
  fleetReachability?: Record<string, ReachabilityState>;
  /** Per-environment projects, for resolving project names in similar-loop results. */
  perEnvProjects?: Record<string, import("../types").Project[]>;
  /** The full environment instance, for log tail in loop cards. */
  instance?: Environment;
  /** Whether this session is ephemeral (scratch). */
  isEphemeral?: boolean;
  /** Callback to persist (save) an ephemeral session. */
  onPersistSession?: () => void;
  /** Current turn count for this session (from ChatSession.turnCount). */
  turnCount?: number;
  /** Callback when a user turn is sent (for turn-count tracking and auto-persist). */
  onTurnSent?: () => void;
  /** Whether auto-persist just triggered (for the "kept — this became a session" notice). */
  autoPersistedJustNow?: boolean;
  /** Callback when the user declines the auto-persist offer. */
  onDeclineAutoPersist?: () => void;
  /** Callback to un-persist a session (make it ephemeral again, usually requires confirm). */
  onUnpersistSession?: () => void;
  /** When true, this session has no home scope and the loop bar should render fleet-wide. */
  fleetMode?: boolean;
  /** Fleet rollup data. Required when fleetMode is true. */
  fleetRollup?: FleetLoopRollup;
  /** All loops with origin metadata, for fleet-mode segment-click handling. */
  fleetLoopsWithOrigin?: LoopWithOrigin[];
  /** The project ID for the session's home project, used for pipeline label counts. */
  projectId?: string;
}

export function SessionChatView({ sessionId, environmentId, environmentName, activeRuntime, model, reasoningEffort, environments, reachability, loops, perEnvLoops, fleetReachability, perEnvProjects, instance, isEphemeral = false, onPersistSession, turnCount, onTurnSent, autoPersistedJustNow, onDeclineAutoPersist, onUnpersistSession, fleetMode, fleetRollup, fleetLoopsWithOrigin, projectId }: SessionChatViewProps): React.ReactNode {
  const intl = useIntl();
  const [agentService] = useInject<IAgentService>(cid.IAgentService);
  const [mcpService] = useInject<IMcpService>(cid.IMcpService);
  const [transcriptService] = useInject<ITranscriptService>(cid.ITranscriptService);
  const [configService] = useInject<IConfigService>(cid.IConfigService);
  const [infraService] = useInject<IInfraService>(cid.IInfraService);
  const [loopShapeCacheService] = useInject<ILoopShapeCacheService>(cid.ILoopShapeCacheService);
  const [siblingOfferService] = useInject<ISiblingOfferService>(cid.ISiblingOfferService);
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
    insertSiblingOffer,
    updateSiblingOfferStatus,
    insertFleetPlan,
    updateFleetPlanStatus,
    updateFleetPlanTarget,
  } = useTranscript(sessionId);

  const [accessMode, setAccessMode] = useState<AccessMode>("full");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [opencodeSessionId, setOpenCodeSessionId] = useState<string | undefined>(undefined);
  const [chainVersion, setChainVersion] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialEnvRef = useRef<string | null>(null);

  // ── Pipeline labels + counts for the loop summary bar ──────────────────
  const [pipelineLabels, setPipelineLabels] = useState<string[]>([]);
  const pipelineCounts = usePipelineCounts(
    fleetMode ? undefined : environmentId,
    pipelineLabels,
    reachability,
  );

  // Load pipeline labels when the project changes
  useEffect(() => {
    if (!projectId || fleetMode) {
      setPipelineLabels([]);
      return;
    }
    let cancelled = false;
    void configService.getProjectPipelineLabels(projectId).then((labels) => {
      if (!cancelled) setPipelineLabels(labels);
    });
    return () => { cancelled = true; };
  }, [projectId, fleetMode, configService]);

  // ── Fleet-wide loops for similar-loop computation ────────────────────
  const fleetLoopsForSimilarity = useMemo(() => {
    if (!fleetReachability || !perEnvProjects) return fleetLoopsWithOrigin ?? [];
    return buildFleetLoopsWithOrigin(perEnvLoops, environments, perEnvProjects, fleetReachability);
  }, [perEnvLoops, environments, perEnvProjects, fleetReachability, fleetLoopsWithOrigin]);

  // ── Auto-persist notice ──────────────────────────────────────────────
  const [showAutoPersistNotice, setShowAutoPersistNotice] = useState(false);
  const autoPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show the "kept — this became a session" notice when auto-persist triggers
  useEffect(() => {
    if (autoPersistedJustNow) {
      setShowAutoPersistNotice(true);
      if (autoPersistTimerRef.current) clearTimeout(autoPersistTimerRef.current);
      autoPersistTimerRef.current = setTimeout(() => {
        setShowAutoPersistNotice(false);
      }, 5000);
    }
    return () => {
      if (autoPersistTimerRef.current) clearTimeout(autoPersistTimerRef.current);
    };
  }, [autoPersistedJustNow]);

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

  // ── Conversational intent detection ──────────────────────────────────
  // Detect phrases like "keep this chat", "save this chat", "keep this",
  // "save this conversation", etc. in the user's message. When detected
  // in an ephemeral session, auto-persist the session.
  const CONVERSATIONAL_PERSIST_PATTERNS = [
    /\bkeep\s+(this\s+)?(chat|conversation|session)\b/i,
    /\bsave\s+(this\s+)?(chat|conversation|session)\b/i,
    /\bdon't\s+(lose|lose|loose|delete)\s+(this\s+)?(chat|conversation)\b/i,
    /\bpersist\s+(this\s+)?(chat|conversation|session)\b/i,
    /\bkeep\s+this\b/i,
    /\bsave\s+this\b/i,
  ];

  function detectConversationalPersistIntent(text: string): boolean {
    return CONVERSATIONAL_PERSIST_PATTERNS.some((p) => p.test(text));
  }

  // ── Send prompt handler ─────────────────────────────────────────────

  const handleSendPrompt = useCallback(
    (text: string) => {
      // ── Conversational intent: persist the session if user says "keep this" ──
      if (isEphemeral && detectConversationalPersistIntent(text)) {
        onPersistSession?.();
      }

      // ── Track turn count for auto-persist ──
      onTurnSent?.();

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
      // ── Pipeline segment click: fetch and display matching issues ──
      if (kind.startsWith("pipeline:")) {
        const label = kind.slice("pipeline:".length);
        if (!label) return;

        // Create a synthetic turn to hold the issue list
        const timestamp = Date.now();
        const turnId = `pipeline-turn-${timestamp}`;
        const userMsgId = `pipeline-msg-${timestamp}-u`;
        const assistantMsgId = `pipeline-msg-${timestamp}-a`;

        const turn: ChatTurn = {
          id: turnId,
          userMessage: {
            id: userMsgId,
            role: "user",
            content: intl.formatMessage({ id: "loopSummary.pipelineQuery" }, { label }),
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

        void infraService.executeAction({
          action: "list-issues",
          params: { labels: label, state: "open" },
        }).then((result) => {
          let content: string;
          if (result.ok && result.data) {
            const listResult = result.data as import("../../../shared/ipc").ListIssuesResult;
            const lines = listResult.issues.map((issue) =>
              `- #${issue.number} ${issue.title}`,
            );
            const header = intl.formatMessage(
              { id: "loopSummary.pipelineIssueStack" },
              { count: listResult.total, label },
            );
            content = listResult.truncated
              ? `${header}\n${lines.join("\n")}\n${intl.formatMessage({ id: "issues.stackTruncated" }, { shown: listResult.issues.length, total: listResult.total })}`
              : `${header}\n${lines.join("\n")}`;
          } else {
            content = intl.formatMessage(
              { id: "issues.listFailed" },
              { detail: typeof result.error === "string" ? result.error : intl.formatMessage({ id: "infra.unknownError" }) },
            );
          }
          appendAssistantContent(turnId, content);
          finishTurn(turnId);
          setActiveTurnId(null);
        });
        return;
      }

      // ── Fleet mode: match across all reachable instances ──
      if (fleetMode && fleetLoopsWithOrigin) {
        const matching = kind === "healthy"
          ? fleetLoopsWithOrigin.filter((lo) => lo.loop.status === "running" || lo.loop.status === "waiting")
          : fleetLoopsWithOrigin.filter((lo) => lo.loop.status === kind);

        if (matching.length > 0) {
          const timestamp = Date.now();

          // Group by environmentId so loop cards are inserted with the correct env context.
          // Each card gets its originating environmentId so the card's actions (pause/stop/trigger)
          // route to the right instance.
          const byEnv = new Map<string, LoopWithOrigin[]>();
          for (const lo of matching) {
            const existing = byEnv.get(lo.environmentId);
            if (existing) {
              existing.push(lo);
            } else {
              byEnv.set(lo.environmentId, [lo]);
            }
          }

          for (const [envId, envLoops] of byEnv) {
            insertLoopCards(
              envLoops.map((lo) => lo.loop.id),
              envId,
            );
          }

          // Auto-diagnose failed loops (per-origin environment)
          const failedLoops = matching.filter((lo) => lo.loop.status === "failed");
          if (failedLoops.length > 0) {
            // Diagnose each failed loop using its originating environment's instance
            const failedByEnv = new Map<string, LoopMeta[]>();
            for (const lo of failedLoops) {
              const existing = failedByEnv.get(lo.environmentId);
              if (existing) {
                existing.push(lo.loop);
              } else {
                failedByEnv.set(lo.environmentId, [lo.loop]);
              }
            }
            for (const [envId, envFailedLoops] of failedByEnv) {
              const envInstance = environments.find((e) => e.id === envId);
              if (envInstance) {
                void diagnoseAndInsert(envFailedLoops, envId, timestamp);
              }
            }
          }
        }
        return;
      }

      // ── Standard (scoped) mode ──
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
    [fleetMode, fleetLoopsWithOrigin, loops, environmentId, insertLoopCards, diagnoseAndInsert, environments, infraService, intl, accessMode, addTurn, appendAssistantContent, finishTurn],
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

          // ── Detect structural changes and offer to sibling loops ──
          if (chainEditRow) {
            const structuralOps = detectStructuralChanges(
              chainEditRow.operationSummaries,
              chainEditRow.proposedSteps,
            );
            if (structuralOps && structuralOps.length > 0) {
              // Extract pre-edit topology from the proposed steps
              // (the proposedSteps represent the POST-edit state; we need
              // the pre-edit topology from the shape cache)
              void (async () => {
                try {
                  const allShapes = await loopShapeCacheService.getAll();
                  // Find the pre-edit shape for this loop
                  const preEditShape = allShapes.find(
                    (s) => s.loopId === loopId && s.environmentId === envId,
                  );
                  if (!preEditShape) return;

                  const preEditTopology = {
                    steps: preEditShape.chainSteps.map((s) => ({
                      taskName: s.taskName,
                      onSuccessTaskId: s.onSuccessTaskId,
                      onFailureTaskId: s.onFailureTaskId,
                    })),
                  };

                  // Post-edit topology from the applied proposal's steps
                  const postEditTopology = extractTopology(chainEditRow.proposedSteps);

                  const structuralDiff = computeStructuralDiff(
                    loopId,
                    envId,
                    structuralOps,
                    postEditTopology,
                  );

                  // Find sibling loops with matching pre-edit topology
                  const siblings = findSiblingLoops({
                    preEditTopology,
                    sourceEnvironmentId: envId,
                    allShapes,
                    reachability: fleetReachability ?? {},
                    environments,
                    perEnvProjects,
                  });

                  // Filter out siblings that have already declined this fingerprint
                  for (const sibling of siblings) {
                    const alreadyDeclined = await siblingOfferService.isDeclined(
                      sibling.environmentId,
                      sibling.loopId,
                      structuralDiff.fingerprint,
                    );
                    if (alreadyDeclined) continue;

                    insertSiblingOffer({
                      offerId: `so-${Date.now()}-${sibling.loopId}`,
                      siblingLoopId: sibling.loopId,
                      siblingEnvironmentId: sibling.environmentId,
                      siblingEnvironmentName: sibling.environmentName,
                      siblingLoopDescription: sibling.loopDescription,
                      structuralDiff,
                      status: "pending",
                      error: null,
                    });
                  }
                } catch {
                  // Sibling discovery is best-effort; failures should not disrupt the user
                }
              })();
            }
          }
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
    [mcpService, updateChainEditProposalStatus, intl, rows, loopShapeCacheService, fleetReachability, environments, perEnvProjects, siblingOfferService, insertSiblingOffer],
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

  // ── Sibling offer callbacks ──────────────────────────────────────────

  const handleSiblingOfferApproved = useCallback(
    (offerId: string, siblingLoopId: string, siblingEnvId: string) => {
      updateSiblingOfferStatus(offerId, "applying");

      // Find the offer row to extract the structural diff
      const offerRow = rows.find(
        (r): r is import("../chat/types").SiblingOfferRow =>
          r.kind === "sibling-offer" && r.offerId === offerId,
      );
      if (!offerRow) {
        updateSiblingOfferStatus(offerId, "error", {
          error: intl.formatMessage({ id: "siblingOffer.applyError" }),
        });
        return;
      }

      // Apply the structural diff on the sibling instance via MCP
      void mcpService.callTool(siblingEnvId, "apply_structural_diff", {
        loopId: siblingLoopId,
        structuralDiff: {
          operations: offerRow.structuralDiff.operations,
          postEditTopology: offerRow.structuralDiff.postEditTopology,
        },
      }).then((result) => {
        if (result.ok) {
          updateSiblingOfferStatus(offerId, "applied");
        } else {
          const errorMsg = typeof result.error === "string"
            ? result.error
            : intl.formatMessage({ id: "siblingOffer.applyError" });
          updateSiblingOfferStatus(offerId, "error", { error: errorMsg });
        }
      }).catch(() => {
        updateSiblingOfferStatus(offerId, "error", {
          error: intl.formatMessage({ id: "siblingOffer.applyError" }),
        });
      });
    },
    [mcpService, updateSiblingOfferStatus, intl, rows],
  );

  const handleSiblingOfferDeclined = useCallback(
    (offerId: string, siblingLoopId: string, siblingEnvId: string, fingerprint: string) => {
      // Persist the decline so it's not offered again
      void siblingOfferService.recordDecline(siblingEnvId, siblingLoopId, fingerprint);
      updateSiblingOfferStatus(offerId, "declined");
    },
    [siblingOfferService, updateSiblingOfferStatus],
  );

  const handleSiblingOfferStatusChange = useCallback(
    (offerId: string, status: SiblingOfferStatus, error?: string) => {
      updateSiblingOfferStatus(offerId, status, error ? { error } : undefined);
    },
    [updateSiblingOfferStatus],
  );

  // ── Fleet plan handlers ──────────────────────────────────────────────

  const handleFleetPlanApply = useCallback(
    (planId: string, checkedTargets: FleetPlanTarget[]) => {
      // Mark unchecked targets as "skipped", then execute checked ones
      for (const target of checkedTargets) {
        updateFleetPlanTarget(planId, target.targetId, { status: "running" });
      }

      // Execute each checked target sequentially via the existing createLoop API
      // This is a placeholder execution model; the actual operation varies by intent
      void (async () => {
        for (const target of checkedTargets) {
          try {
            // Find the environment for this target
            const env = environments.find((e) => e.id === target.environmentId);
            const instanceForTarget = env
              ? { ...instance, id: env.id, name: env.name }
              : undefined;

            if (!instanceForTarget) {
              updateFleetPlanTarget(planId, target.targetId, {
                status: "failed",
                error: `Instance ${target.environmentName} not found`,
              });
              continue;
            }

            // Use the agent to execute the operation via MCP on the target instance
            const result = await mcpService.callTool(target.environmentId, "execute_fleet_operation", {
              description: target.operation,
              projectId: target.projectId,
            });

            if (result.ok) {
              updateFleetPlanTarget(planId, target.targetId, { status: "ok" });
            } else {
              const errorMsg = typeof result.error === "string"
                ? result.error
                : intl.formatMessage({ id: "fleetPlan.applyToSelected" }, { count: 0 });
              updateFleetPlanTarget(planId, target.targetId, {
                status: "failed",
                error: errorMsg,
              });
            }
          } catch {
            updateFleetPlanTarget(planId, target.targetId, {
              status: "failed",
              error: intl.formatMessage({ id: "fleetPlan.applyToSelected" }, { count: 0 }),
            });
          }
        }

        // Mark the plan as applied after all targets are done
        updateFleetPlanStatus(planId, "applied");
      })();
    },
    [environments, instance, mcpService, updateFleetPlanTarget, updateFleetPlanStatus, intl],
  );

  const handleFleetPlanCancel = useCallback(
    (planId: string) => {
      // Mark all pending targets as skipped
      const planRow = rows.find(
        (r): r is import("../chat/types").FleetPlanRow =>
          r.kind === "fleet-plan" && r.planId === planId,
      );
      if (planRow) {
        for (const target of planRow.targets) {
          if (target.status === "pending") {
            updateFleetPlanTarget(planId, target.targetId, { status: "skipped" });
          }
        }
      }
    },
    [rows, updateFleetPlanTarget],
  );

  const handleFleetPlanStatusChange = useCallback(
    (planId: string, status: FleetPlanStatus, error?: string) => {
      updateFleetPlanStatus(planId, status, error ? { error } : undefined);
    },
    [updateFleetPlanStatus],
  );

  const handleFleetPlanTargetCheckedChange = useCallback(
    (planId: string, targetId: string, checked: boolean) => {
      updateFleetPlanTarget(planId, targetId, { checked });
    },
    [updateFleetPlanTarget],
  );

  const handleFleetPlanTargetStatusChange = useCallback(
    (planId: string, targetId: string, status: FleetPlanTargetStatus, error?: string) => {
      updateFleetPlanTarget(planId, targetId, { status, ...(error ? { error } : {}) });
    },
    [updateFleetPlanTarget],
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
      <LoopSummaryBar loops={loops} reachability={reachability} onSegmentClick={handleSegmentClick} fleetMode={fleetMode} fleetRollup={fleetRollup} pipelineCounts={pipelineCounts} />
      {showAutoPersistNotice ? (
        <div className="auto-persist-notice">
          <span className="auto-persist-notice-text">
            {intl.formatMessage({ id: "session.autoPersistNotice" })}
          </span>
          {onDeclineAutoPersist ? (
            <button
              className="auto-persist-decline-btn"
              onClick={onDeclineAutoPersist}
            >
              {intl.formatMessage({ id: "session.autoPersistDecline" })}
            </button>
          ) : null}
        </div>
      ) : null}
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
                const isAssistantCrossScope = row.environmentId != null && row.environmentId !== environmentId;
                return (
                  <div key={row.id} className="transcript-assistant-msg">
                    <div className="transcript-avatar session-assistant-avatar">{activeRuntime === "claude" ? "CC" : "OC"}</div>
                    <div className="transcript-msg-body">
                      <Suspense fallback={null}>
                        <MarkdownContent content={row.content} streaming={row.streaming} />
                      </Suspense>
                      {envName ? (
                        <span className={`transcript-instance-attribution${isAssistantCrossScope ? " transcript-instance-attribution--cross-scope" : ""}`}>
                          {isAssistantCrossScope
                            ? intl.formatMessage({ id: "crossScope.assistantAttribution" }, { instance: envName })
                            : intl.formatMessage({ id: "instanceAttribution.label" }, { instance: envName })
                          }
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
                // In fleet mode, look up the origin (project + instance) for this card
                const origin = fleetMode && fleetLoopsWithOrigin
                  ? fleetLoopsWithOrigin.find((lo) => lo.loop.id === row.loopId)
                  : undefined;
                const originEnv = origin
                  ? environments.find((e) => e.id === origin.environmentId)
                  : undefined;
                const isLoopCardCrossScope = row.environmentId !== environmentId;
                return (
                  <div key={row.id} className="transcript-loop-card">
                    {origin ? (
                      <span className={`loop-card-origin-label${isLoopCardCrossScope ? " loop-card-origin-label--cross-scope" : ""}`}>
                        {isLoopCardCrossScope
                          ? intl.formatMessage(
                              { id: "crossScope.loopCardLabel" },
                              { project: origin.projectName, instance: originEnv?.name ?? origin.environmentName },
                            )
                          : intl.formatMessage(
                              { id: "loopCard.originLabel" },
                              { project: origin.projectName, instance: originEnv?.name ?? origin.environmentName },
                            )
                        }
                      </span>
                    ) : null}
                    <LoopCard loop={loop} reachability={reachability} instance={originEnv ?? instance} scrollContainerRef={scrollRef} chainVersion={chainVersion} />
                  </div>
                );
              }
              case "loop-proposal": {
                const similar = row.status === "pending" && fleetReachability
                  ? computeSimilarLoops({
                      proposal: { command: row.command, interval: row.interval, projectName: row.projectName },
                      fleetLoops: fleetLoopsForSimilarity,
                      reachability: fleetReachability,
                      ownEnvironmentId: environmentId,
                    })
                  : undefined;
                return (
                  <div key={row.id} className="transcript-loop-proposal">
                    <FleetShapedProposalCard
                      row={row}
                      instance={instance}
                      onApproved={handleProposalApproved}
                      onRejected={handleProposalRejected}
                      onStatusChange={handleProposalStatusChange}
                      similarLoops={similar}
                      environments={environments}
                      environmentId={environmentId}
                      loopShapeCacheService={loopShapeCacheService}
                      infraService={infraService}
                      homeEnvironmentId={environmentId}
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
                      homeEnvironmentId={environmentId}
                      environments={environments}
                    />
                  </div>
                );
              }
              case "sibling-offer": {
                return (
                  <div key={row.id} className="transcript-sibling-offer">
                    <SiblingOfferCard
                      row={row}
                      instance={instance}
                      onApproved={handleSiblingOfferApproved}
                      onDeclined={handleSiblingOfferDeclined}
                      onStatusChange={handleSiblingOfferStatusChange}
                      homeEnvironmentId={environmentId}
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
              case "pr-reference-card": {
                return (
                  <div key={row.id} className="transcript-pr-reference-card">
                    <PrReferenceCard row={row} />
                  </div>
                );
              }
              case "fleet-plan": {
                return (
                  <div key={row.id} className="transcript-fleet-plan">
                    <FleetPlanCard
                      row={row}
                      onApply={handleFleetPlanApply}
                      onCancel={handleFleetPlanCancel}
                      onStatusChange={handleFleetPlanStatusChange}
                      onTargetCheckedChange={handleFleetPlanTargetCheckedChange}
                      onTargetStatusChange={handleFleetPlanTargetStatusChange}
                    />
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
        isEphemeral={isEphemeral}
        onPersistSession={onPersistSession}
        onUnpersistSession={onUnpersistSession}
      />
    </div>
  );
}
