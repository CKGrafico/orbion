import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cid, useInject } from "inversify-hooks";
import type { ChatTurn, AccessMode, ApprovalDecision, ToolCall, ChainEditProposalStatus, ChainEditOperationSummary, LoopProposalStatus, SharedTaskWarning, SiblingOfferStatus, FleetPlanStatus, FleetPlanTarget } from "../chat/types";
import type { AgentStreamEvent, ReasoningEffort, ReachabilityState } from "../../../shared/ipc";
import type { IAgentService, IMcpService, ITranscriptService, IConfigService, IInfraService, ILoopShapeCacheService, ISiblingOfferService } from "../services/interfaces";
import type { LoopMeta, Environment, LoopWithOrigin, FleetLoopRollup } from "../types";
import { useTranscript } from "../chat/useTranscript";
import { diagnoseFailure } from "../chat/diagnoseFailure";
import { computeSimilarLoops } from "../fleet-similarity";

import { detectStructuralChanges, findSiblingLoops, computeStructuralDiff, extractTopology } from "../fleet-structural-diff";
import { ChatComposer } from "../chat/ChatComposer";
import { LoopSummaryBar, type LoopSegmentKind } from "./LoopSummaryBar";
import { usePipelineCounts } from "./usePipelineCounts";
import { LoopCard } from "./LoopCard";
import { FleetShapedProposalCard } from "./FleetShapedProposalCard";
import { ChainEditProposalCard } from "./ChainEditProposalCard";
import { SiblingOfferCard } from "./SiblingOfferCard";
import { FleetPlanCard } from "./FleetPlanCard";
import { FailureDiagnosisPanel } from "./FailureDiagnosisPanel";
import { PrReferenceCard } from "./PrReferenceCard";
import { WifiOff } from "lucide-react";
import { fetchLogs } from "../api";
import { translateMessage } from "../i18n";

const MarkdownContent = lazy(() =>
  import("../chat/MarkdownContent").then((m) => ({ default: m.MarkdownContent })),
);
import { ToolCallInlineBlock } from "../chat/ToolCallInlineBlock";
import { ToolCallsExpander } from "../chat/ToolCallsExpander";
import { TurnFold } from "../chat/TurnFold";

function detectSharedTaskWarning(
  editedLoopId: string,
  operationSummaries: ChainEditOperationSummary[],
  allLoops: LoopMeta[],
): SharedTaskWarning | undefined {
  const updateOps = operationSummaries.filter((op) => op.kind === "update-task");
  if (updateOps.length === 0) return undefined;

  // Best-effort: check if any other loop references the same taskId as the edited loop.
  // Deep chain references (onSuccess/onFailure) require fetching tasks from the daemon;
  // the MCP tool performs the full transitive check and includes sharedTaskWarning if needed.
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
  loops: LoopMeta[];
  perEnvLoops: Record<string, LoopMeta[]>;
  fleetReachability?: Record<string, ReachabilityState>;
  perEnvProjects?: Record<string, import("../types").Project[]>;
  instance?: Environment;
  isEphemeral?: boolean;
  onPersistSession?: () => void;
  turnCount?: number;
  onTurnSent?: () => void;
  autoPersistedJustNow?: boolean;
  onDeclineAutoPersist?: () => void;
  onUnpersistSession?: () => void;
  fleetMode?: boolean;
  fleetRollup?: FleetLoopRollup;
  fleetLoopsWithOrigin?: LoopWithOrigin[];
  projectId?: string;
}

export function SessionChatView({ sessionId, environmentId, environmentName, activeRuntime, model, reasoningEffort, environments, reachability, loops, perEnvLoops, fleetReachability, perEnvProjects, instance, isEphemeral = false, onPersistSession, onTurnSent, autoPersistedJustNow, onDeclineAutoPersist, onUnpersistSession, fleetMode, fleetRollup, fleetLoopsWithOrigin, projectId }: SessionChatViewProps): React.ReactNode {
  const { t } = useTranslation();
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
    updateLoopProposalStatus,
    insertChainEditProposal,
    updateChainEditProposalStatus,
    updateChainEditProposalForkDecision,
    insertSiblingOffer,
    updateSiblingOfferStatus,
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

  const [pipelineLabels, setPipelineLabels] = useState<string[]>([]);
  const pipelineCounts = usePipelineCounts(
    fleetMode ? undefined : environmentId,
    pipelineLabels,
    reachability,
  );

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

  const fleetLoopsForSimilarity = useMemo(() => {
    if (!fleetReachability || !perEnvProjects) return fleetLoopsWithOrigin ?? [];
    return buildFleetLoopsWithOrigin(perEnvLoops, environments, perEnvProjects, fleetReachability);
  }, [perEnvLoops, environments, perEnvProjects, fleetReachability, fleetLoopsWithOrigin]);

  const [showAutoPersistNotice, setShowAutoPersistNotice] = useState(false);
  const autoPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const isReachable = reachability === "connected" || reachability === undefined || reachability === "reconnecting";

  // When the environmentId changes (instance switch), any in-flight
  // streaming from the old instance should be abandoned and the transcript
  // should be reloaded to pick up the handoff divider message.
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


  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [rows]);


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

            if (event.status === "completed" && event.output) {
              try {
                const parsed = JSON.parse(event.output);
                if (parsed && parsed.chainEditProposal === true) {
                  const loopId = parsed.loopId ?? "";
                  const operationSummaries = Array.isArray(parsed.operationSummaries) ? parsed.operationSummaries as ChainEditOperationSummary[] : [];

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


  const handleSendPrompt = useCallback(
    (text: string) => {
      if (isEphemeral && detectConversationalPersistIntent(text)) {
        onPersistSession?.();
      }

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
              : translateMessage(result.error) || t("agent.promptError");
            appendAssistantContent(turnId, errorMsg);
            finishTurn(turnId);
            setActiveTurnId(null);
          }
        });
    },
    [accessMode, addTurn, agentService, appendAssistantContent, environmentId, finishTurn, opencodeSessionId, sessionId, model, reasoningEffort],
  );


  const handleInterrupt = useCallback(
    (turnId: string) => {
      interruptTurn(turnId);
      setActiveTurnId(null);
      void agentService.interrupt(environmentId, opencodeSessionId);
    },
    [agentService, environmentId, interruptTurn, opencodeSessionId],
  );


  const handleResolveApproval = useCallback(
    (_approvalId: string, _decision: ApprovalDecision) => {
    },
    [],
  );

  const handleAnswerQuestion = useCallback(
    (_questionId: string, _answer: string) => {
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


  /** Diagnose failed loops after inserting loop cards. */
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
            params: diagnosis.params,
            confidence: diagnosis.confidence,
            summonTimestamp,
          });
        } catch {
          const diagnosis = diagnoseFailure(loop, "");
          insertFailureDiagnosis({
            loopId: loop.id,
            environmentId: envId,
            category: diagnosis.category,
            summary: diagnosis.summary,
            nextStep: diagnosis.nextStep,
            params: diagnosis.params,
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
      if (kind.startsWith("pipeline:")) {
        const label = kind.slice("pipeline:".length);
        if (!label) return;

        const timestamp = Date.now();
        const turnId = `pipeline-turn-${timestamp}`;
        const userMsgId = `pipeline-msg-${timestamp}-u`;
        const assistantMsgId = `pipeline-msg-${timestamp}-a`;

        const turn: ChatTurn = {
          id: turnId,
          userMessage: {
            id: userMsgId,
            role: "user",
            content: t("loopSummary.pipelineQuery", { label }),
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
            const header = t(
              "loopSummary.pipelineIssueStack",
              { count: listResult.total, label },
            );
            content = listResult.truncated
              ? `${header}\n${lines.join("\n")}\n${t("issues.stackTruncated", { shown: listResult.issues.length, total: listResult.total })}`
              : `${header}\n${lines.join("\n")}`;
          } else {
            content = t(
              "issues.listFailed",
              { detail: typeof result.error === "string" ? result.error : t("infra.unknownError") },
            );
          }
          appendAssistantContent(turnId, content);
          finishTurn(turnId);
          setActiveTurnId(null);
        });
        return;
      }

      if (fleetMode && fleetLoopsWithOrigin) {
        const matching = kind === "healthy"
          ? fleetLoopsWithOrigin.filter((lo) => lo.loop.status === "running" || lo.loop.status === "waiting")
          : fleetLoopsWithOrigin.filter((lo) => lo.loop.status === kind);

        if (matching.length > 0) {
          const timestamp = Date.now();

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

          const failedLoops = matching.filter((lo) => lo.loop.status === "failed");
          if (failedLoops.length > 0) {
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

      const matchingLoops = kind === "healthy"
        ? loops.filter((l) => l.status === "running" || l.status === "waiting")
        : loops.filter((l) => l.status === kind);

      if (matchingLoops.length > 0) {
        const timestamp = Date.now();
        insertLoopCards(
          matchingLoops.map((l) => l.id),
          environmentId,
        );

        const failedLoops = matchingLoops.filter((l) => l.status === "failed");
        if (failedLoops.length > 0) {
          void diagnoseAndInsert(failedLoops, environmentId, timestamp);
        }
      }
    },
    [fleetMode, fleetLoopsWithOrigin, loops, environmentId, insertLoopCards, diagnoseAndInsert, environments, infraService, accessMode, addTurn, appendAssistantContent, finishTurn],
  );


  const handleProposalApproved = useCallback(
    (proposalId: string, loopId: string, envId: string) => {
      updateLoopProposalStatus(proposalId, "created", { createdLoopId: loopId });
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


  const handleChainEditApproved = useCallback(
    (proposalId: string, loopId: string, envId: string) => {
      const chainEditRow = rows.find(
        (r): r is import("../chat/types").ChainEditProposalRow =>
          r.kind === "chain-edit-proposal" && r.proposalId === proposalId,
      );
      const forkStrategy = chainEditRow?.sharedTaskWarning?.decision ?? "change-all";

      void mcpService.callTool(envId, "apply_chain_edit", { proposalId, loopId, forkStrategy }).then((result) => {
        if (result.ok) {
          updateChainEditProposalStatus(proposalId, "applied");
          setChainVersion((prev) => prev + 1);

          if (chainEditRow) {
            const structuralOps = detectStructuralChanges(
              chainEditRow.operationSummaries,
              chainEditRow.proposedSteps,
            );
            if (structuralOps && structuralOps.length > 0) {
              void (async () => {
                try {
                  const allShapes = await loopShapeCacheService.getAll();
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

                  const postEditTopology = extractTopology(chainEditRow.proposedSteps);

                  const structuralDiff = computeStructuralDiff(
                    loopId,
                    envId,
                    structuralOps,
                    postEditTopology,
                  );

                  const siblings = findSiblingLoops({
                    preEditTopology,
                    sourceEnvironmentId: envId,
                    allShapes,
                    reachability: fleetReachability ?? {},
                    environments,
                    perEnvProjects,
                  });

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
            : t("chainEditProposal.applyError");
          updateChainEditProposalStatus(proposalId, "error", { error: errorMsg });
        }
      }).catch(() => {
        updateChainEditProposalStatus(proposalId, "error", {
          error: t("chainEditProposal.applyError"),
        });
      });
    },
    [mcpService, updateChainEditProposalStatus, rows, loopShapeCacheService, fleetReachability, environments, perEnvProjects, siblingOfferService, insertSiblingOffer],
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


  const handleSiblingOfferApproved = useCallback(
    (offerId: string, siblingLoopId: string, siblingEnvId: string) => {
      updateSiblingOfferStatus(offerId, "applying");

      const offerRow = rows.find(
        (r): r is import("../chat/types").SiblingOfferRow =>
          r.kind === "sibling-offer" && r.offerId === offerId,
      );
      if (!offerRow) {
        updateSiblingOfferStatus(offerId, "error", {
          error: t("siblingOffer.applyError"),
        });
        return;
      }

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
            : t("siblingOffer.applyError");
          updateSiblingOfferStatus(offerId, "error", { error: errorMsg });
        }
      }).catch(() => {
        updateSiblingOfferStatus(offerId, "error", {
          error: t("siblingOffer.applyError"),
        });
      });
    },
    [mcpService, updateSiblingOfferStatus, rows],
  );

  const handleSiblingOfferDeclined = useCallback(
    (offerId: string, siblingLoopId: string, siblingEnvId: string, fingerprint: string) => {
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


  const handleFleetPlanApply = useCallback(
    (planId: string, checkedTargets: FleetPlanTarget[]) => {
      for (const target of checkedTargets) {
        updateFleetPlanTarget(planId, target.targetId, { status: "running" });
      }

      // Execute each checked target sequentially via the existing createLoop API
      // This is a placeholder execution model; the actual operation varies by intent
      void (async () => {
        for (const target of checkedTargets) {
          try {
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

            const result = await mcpService.callTool(target.environmentId, "execute_fleet_operation", {
              description: target.operation,
              projectId: target.projectId,
            });

            if (result.ok) {
              updateFleetPlanTarget(planId, target.targetId, { status: "ok" });
            } else {
              const errorMsg = typeof result.error === "string"
                ? result.error
                : t("fleetPlan.applyToSelected", { count: 0 });
              updateFleetPlanTarget(planId, target.targetId, {
                status: "failed",
                error: errorMsg,
              });
            }
          } catch {
            updateFleetPlanTarget(planId, target.targetId, {
              status: "failed",
              error: t("fleetPlan.applyToSelected", { count: 0 }),
            });
          }
        }

        updateFleetPlanStatus(planId, "applied");
      })();
    },
    [environments, instance, mcpService, updateFleetPlanTarget, updateFleetPlanStatus],
  );

  const handleFleetPlanCancel = useCallback(
    (planId: string) => {
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

  return (
    <div className="session-chat-panel">
      {!isReachable ? (
        <div className="unreachable-banner">
          <WifiOff size={13} />
          {t(
            "unreachableBanner.unreachable",
            { instance: environmentName },
          )}
        </div>
      ) : null}
      {loops.length > 0 && !fleetMode ? (
        <div className="loop-button-bar">
          {loops.map((loop) => {
            const color = loop.status === "running" ? "var(--status-running)"
              : loop.status === "waiting" ? "var(--status-waiting)"
              : loop.status === "failed" ? "var(--status-failed)"
              : loop.status === "finished" ? "var(--status-finished)"
              : loop.status === "paused" ? "var(--status-paused)"
              : "var(--status-stopped)";
            const label = loop.description?.trim() || loop.id;
            return (
              <button
                key={loop.id}
                className="loop-button-bar-item"
                title={label}
                onClick={() => {
                  insertLoopCards([loop.id], environmentId);
                  if (loop.status === "failed") {
                    void diagnoseAndInsert([loop], environmentId, Date.now());
                  }
                }}
              >
                <span className="loop-button-bar-dot" style={{ background: color }} />
                <span className="loop-button-bar-label">{label}</span>
              </button>
            );
          })}
        </div>
      ) : fleetMode ? (
        <LoopSummaryBar loops={loops} reachability={reachability} onSegmentClick={handleSegmentClick} fleetMode={fleetMode} fleetRollup={fleetRollup} pipelineCounts={pipelineCounts} />
      ) : null}
      {showAutoPersistNotice ? (
        <div className="auto-persist-notice">
          <span className="auto-persist-notice-text">
            {t("session.autoPersistNotice")}
          </span>
          {onDeclineAutoPersist ? (
            <button
              className="auto-persist-decline-btn"
              onClick={onDeclineAutoPersist}
            >
              {t("session.autoPersistDecline")}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="session-chat-scroll" ref={scrollRef}>
        {rows.length === 0 ? (
          <div className="session-chat-empty">
            <p>{t("session.emptyDescription")}</p>
          </div>
        ) : (
          rows.map((row) => {
            switch (row.kind) {
              case "user-message":
                return (
                  <div key={row.id} className="transcript-user-msg">
                    <div className="transcript-avatar session-user-avatar">{t("session.userInitials")}</div>
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
                            ? t("crossScope.assistantAttribution", { instance: envName })
                            : t("instanceAttribution.label", { instance: envName })
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
                return null;
              case "instance-handoff":
                return (
                  <div key={row.id} className="transcript-instance-handoff">
                    <span className="transcript-handoff-line" />
                    <span className="transcript-handoff-text">
                      {t(
                        "instanceHandoff.label",
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
                          ? t(
                              "crossScope.loopCardLabel",
                              { project: origin.projectName, instance: originEnv?.name ?? origin.environmentName },
                            )
                          : t(
                              "loopCard.originLabel",
                              { project: origin.projectName, instance: originEnv?.name ?? origin.environmentName },
                            )
                        }
                      </span>
                    ) : null}
                    <LoopCard loop={loop} reachability={reachability} instance={instance} scrollContainerRef={scrollRef} chainVersion={chainVersion} />
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
