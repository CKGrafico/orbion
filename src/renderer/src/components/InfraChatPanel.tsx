import React, { lazy, Suspense, useCallback, useRef, useState } from "react";
import { useIntl, type IntlShape } from "react-intl";
import { cid, useInject } from "inversify-hooks";
import type { ChatTurn, AccessMode } from "../types";
import type { InfraActionArgs, MachineStatusEntry, CreateIssueResult, WatchTarget, WatchCondition } from "../../../shared/ipc";
import type { IInfraService, IWatchService, IConfigService } from "../services/interfaces";
import { useTranscript } from "../chat/useTranscript";
import { ChatComposer } from "../chat/ChatComposer";

const MarkdownContent = lazy(() =>
  import("../chat/MarkdownContent").then((m) => ({ default: m.MarkdownContent })),
);
import { Server } from "lucide-react";
import type { ApprovalDecision } from "../chat/types";
import { QuestionPanel } from "../chat/QuestionPanel";
import { translateMessage } from "../i18n";

interface InfraChatPanelProps {
  mainVmId: string;
  mainVmName: string;
}

function formatMachineStatusReport(intl: IntlShape, data: unknown): string {
  if (!Array.isArray(data)) return intl.formatMessage({ id: "infra.noData" });
  const lines: string[] = [`## ${intl.formatMessage({ id: "infra.fleetStatusHeader" })}\n`];
  for (const machine of data as MachineStatusEntry[]) {
    const icon = machine.health === "connected" ? "🟢" : machine.health === "offline" ? "🔴" : "🟡";
    lines.push(`**${machine.name}** ${icon} \`${machine.health}\``);
    for (const ep of machine.endpoints) {
      lines.push(`  - ${ep.kind}: \`${ep.url}\``);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Parse a watch intent from natural language and create a ConditionWatch.
 * Returns a human-readable response string.
 *
 * Supported conditions (limited to what Orbion can actually observe):
 * - "ping me when loop-1 is running/stopped/failed/paused"
 * - "ping me when the instance is back online"
 * - "watch for loop-1 to fail/stop" (status-transition to stopped/failed)
 *
 * The agent declines conditions it cannot monitor.
 */
async function parseWatchIntent(
  text: string,
  watchService: IWatchService,
  configService: IConfigService,
): Promise<string> {
  const lower = text.toLowerCase();

  // Supported loop statuses that Orbion can observe
  const observableStatuses = ["running", "waiting", "paused", "idle", "stopped", "failed"];

  // Try to match status-transition to a specific loop
  for (const status of observableStatuses) {
    const patterns = [
      new RegExp(`(?:ping|tell|notify|alert)\\s+me\\s+when\\s+.+?\\s+(?:is|goes|becomes)\\s+${status}`, "i"),
      new RegExp(`watch\\s+(?:for\\s+)?(.+?)\\s+to\\s+(?:be\\s+)?${status}`, "i"),
      new RegExp(`watch\\s+when\\s+.+?\\s+(?:is|goes|becomes)\\s+${status}`, "i"),
    ];

    let matched = false;
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        matched = true;
        break;
      }
    }

    if (matched) {
      const loopRef = extractLoopRef(text);
      const envId = await resolveDefaultEnvId(configService);

      if (!envId) {
        return "I can't set a watch because no environment is configured. Add a VM first.";
      }

      if (loopRef) {
        const target: WatchTarget = {
          kind: "loop",
          loopId: loopRef,
          environmentId: envId,
        };
        const condition: WatchCondition = {
          kind: "status-transition",
          targetStatus: status,
          description: `status becomes ${status}`,
        };

        await watchService.addWatch({ target, condition });
        return `Watching for **${loopRef}** to become **${status}**. I'll notify you when it happens. One-shot: the watch disarms after firing.`;
      }

      return `I understood you want to watch for something becoming **${status}**, but I couldn't identify which loop. Try: "ping me when loop-1 is ${status}" or reference a specific loop ID.`;
    }
  }

  // Try to match reachability-change (instance back online / offline)
  const isReachabilityIntent =
    lower.includes("back up") ||
    lower.includes("back online") ||
    lower.includes("goes offline") ||
    lower.includes("comes back") ||
    lower.includes("instance down") ||
    lower.includes("instance offline");

  if (isReachabilityIntent) {
    const envId = await resolveDefaultEnvId(configService);
    if (!envId) {
      return "I can't set a watch because no environment is configured. Add a VM first.";
    }

    const target: WatchTarget = {
      kind: "instance",
      environmentId: envId,
    };
    const condition: WatchCondition = {
      kind: "reachability-change",
      description: lower.includes("offline") || lower.includes("down")
        ? "instance goes offline"
        : "instance comes back online",
    };

    await watchService.addWatch({ target, condition });
    return `Watching for **reachability change** on your environment. I'll notify you when it happens. One-shot: the watch disarms after firing.`;
  }

  // Decline: condition not in the observable vocabulary
  return "I can only watch for conditions Orbion can actually observe: a loop's status changing (running, waiting, paused, stopped, failed) or an instance's reachability. Try: \"ping me when loop-1 is running\" or \"tell me when the instance is back online.\"";
}

/** Extract a loop reference (ID or substring) from free text. */
function extractLoopRef(text: string): string | null {
  // Match patterns like "loop-1", "loop-42"
  const loopIdMatch = text.match(/loop[- ]?(\w+)/i);
  if (loopIdMatch) return `loop-${loopIdMatch[1]}`;

  // Match quoted references: when "the build" is ...
  const quotedMatch = text.match(/when\s+"([^"]+)"\s/i) ?? text.match(/when\s+([^\s]+(?:\s+(?:is|goes|becomes)))/i);
  if (quotedMatch && quotedMatch[1]) {
    const ref = quotedMatch[1].replace(/\s+(is|goes|becomes)$/i, "").trim();
    if (ref && ref.length > 1 && ref.length < 40) return ref;
  }

  return null;
}

/** Resolve the default environment ID for the watch target. */
async function resolveDefaultEnvId(configService: IConfigService): Promise<string | null> {
  const selected = await configService.getSelectedEnvironmentId();
  if (selected) return selected;
  const envs = await configService.getEnvironments();
  return envs.length > 0 ? envs[0].id : null;
}

export function InfraChatPanel({ mainVmId, mainVmName }: InfraChatPanelProps): React.ReactNode {
  const intl = useIntl();
  const [infraService] = useInject<IInfraService>(cid.IInfraService);
  const [configService] = useInject<IConfigService>(cid.IConfigService);
  const {
    turns,
    rows,
    toggleTurnCollapse,
    toggleToolExpand,
    collapseAllFinishedTurns,
    expandAllTurns,
    addTurn,
    appendAssistantContent,
    finishTurn,
    interruptTurn,
    resolveApproval,
    answerQuestion,
    setTurnAccessMode,
  } = useTranscript();

  const [watchService] = useInject<IWatchService>(cid.IWatchService);

  const [accessMode, setAccessMode] = useState<AccessMode>("supervised");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  /** Pending issue drafts keyed by turnId, awaiting user confirmation */
  const [pendingIssues, setPendingIssues] = useState<Record<string, { title: string; body: string }>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSendPrompt = useCallback(
    (text: string) => {
      const now = Date.now();
      const turnId = `infra-turn-${now}`;
      const lower = text.toLowerCase();

      // Detect "ping me when / tell me when / watch for" intent
      const isWatchIntent =
        lower.includes("ping me when") ||
        lower.includes("tell me when") ||
        lower.includes("notify me when") ||
        lower.includes("watch for") ||
        lower.includes("alert me when") ||
        lower.includes("alert when") ||
        lower.includes("watch when");

      if (isWatchIntent) {
        const turn: ChatTurn = {
          id: turnId,
          userMessage: {
            id: `infra-msg-${now}-u`,
            role: "user",
            content: text,
            startedAt: now,
          },
          assistantMessage: {
            id: `infra-msg-${now}-a`,
            role: "assistant",
            content: "",
            toolCalls: [],
            startedAt: now + 100,
            finishedAt: undefined,
          },
          finished: false,
          collapsed: false,
          accessMode,
        };
        addTurn(turn);
        setActiveTurnId(turnId);

        // Parse the watch intent
        void (async () => {
          const result = await parseWatchIntent(text, watchService, configService);
          appendAssistantContent(turnId, result);
          finishTurn(turnId);
          setActiveTurnId(null);
        })();

        return;
      }

      // Detect "create issue" intent
      const isCreateIssue =
        lower.includes("create issue") ||
        lower.includes("file issue") ||
        lower.includes("new issue") ||
        lower.includes("open issue");

      if (isCreateIssue) {
        const lines = text.split("\n");
        const firstLine = lines[0];
        // Extract title: try to strip the command prefix like "create issue:" or "file issue:" 
        const titleMatch = firstLine.match(/^(?:create|file|open|new)\s+issue[:\s]+(.+)/i);
        const title = titleMatch ? titleMatch[1].trim() : firstLine.replace(/^(?:create|file|open|new)\s+issue\s*/i, "").trim();
        const body = lines.length > 1 ? lines.slice(1).join("\n").trim() : title;

        if (!title) {
          const turn: ChatTurn = {
            id: turnId,
            userMessage: {
              id: `infra-msg-${now}-u`,
              role: "user",
              content: text,
              startedAt: now,
            },
            assistantMessage: {
              id: `infra-msg-${now}-a`,
              role: "assistant",
              content: intl.formatMessage({ id: "issues.titleRequired" }),
              toolCalls: [],
              startedAt: now + 100,
              finishedAt: now + 100,
            },
            finished: true,
            collapsed: false,
            accessMode,
          };
          addTurn(turn);
          setActiveTurnId(null);
          return;
        }

        const draftPreview = `**${intl.formatMessage({ id: "issues.draftTitle" })}**\n\n### ${title}\n\n${body}`;
        const questionId = `issue-q-${now}`;

        const turn: ChatTurn = {
          id: turnId,
          userMessage: {
            id: `infra-msg-${now}-u`,
            role: "user",
            content: text,
            startedAt: now,
          },
          assistantMessage: {
            id: `infra-msg-${now}-a`,
            role: "assistant",
            content: draftPreview,
            toolCalls: [],
            startedAt: now + 100,
            finishedAt: undefined,
          },
          finished: false,
          collapsed: false,
          accessMode,
          question: {
            id: questionId,
            turnId,
            text: intl.formatMessage({ id: "issues.fileQuestion" }),
            options: [
              { key: "file", label: intl.formatMessage({ id: "issues.optionFile" }) },
              { key: "cancel", label: intl.formatMessage({ id: "issues.optionCancel" }) },
            ],
            singleChoice: true,
            allowFreeText: false,
            resolved: false,
          },
        };
        addTurn(turn);
        setActiveTurnId(turnId);
        setPendingIssues((prev) => ({ ...prev, [turnId]: { title, body } }));
        return;
      }

      const turn: ChatTurn = {
        id: turnId,
        userMessage: {
          id: `infra-msg-${now}-u`,
          role: "user",
          content: text,
          startedAt: now,
        },
        assistantMessage: {
          id: `infra-msg-${now}-a`,
          role: "assistant",
          content: "",
          toolCalls: [],
          startedAt: now + 100,
          finishedAt: undefined,
        },
        finished: false,
        collapsed: false,
        accessMode,
      };
      addTurn(turn);
      setActiveTurnId(turnId);

      let action: InfraActionArgs | null = null;

      if (lower.includes("status") || lower.includes("health") || lower.includes("machine")) {
        action = { action: "machine-status" };
      } else if (lower.includes("clone") || lower.includes("repo")) {
        const repoMatch = text.match(/(https?:\/\/[^\s]+)/);
        action = { action: "clone-repo", params: { repoUrl: repoMatch?.[1] ?? "" } };
      }

      if (action) {
        void infraService.executeAction(action).then((result) => {
          if (!result) return;
          let responseText: string;
          if (result.ok) {
            if (action!.action === "machine-status") {
              responseText = formatMachineStatusReport(intl, result.data);
            } else if (action!.action === "clone-repo") {
              responseText = intl.formatMessage({ id: "infra.cloneInitiated" }, { data: JSON.stringify(result.data, null, 2) });
            } else {
              responseText = JSON.stringify(result.data, null, 2);
            }
          } else {
            responseText = intl.formatMessage({ id: "infra.errorMessage" }, { detail: translateMessage(intl, result.error) || intl.formatMessage({ id: "infra.unknownError" }) });
          }
          appendAssistantContent(turnId, responseText);
          finishTurn(turnId);
          setActiveTurnId(null);
        });
      } else {
        const fallback = intl.formatMessage({ id: "infra.helpText" });
        let idx = 0;
        const interval = setInterval(() => {
          const chunkSize = Math.floor(Math.random() * 6) + 3;
          const chunk = fallback.slice(idx, idx + chunkSize);
          idx += chunkSize;
          appendAssistantContent(turnId, chunk);
          if (idx >= fallback.length) {
            clearInterval(interval);
            finishTurn(turnId);
            setActiveTurnId(null);
          }
        }, 30);
      }
    },
    [intl, accessMode, addTurn, appendAssistantContent, finishTurn, infraService, watchService, configService],
  );

  const handleInterrupt = useCallback(
    (turnId: string) => {
      interruptTurn(turnId);
      setActiveTurnId(null);
    },
    [interruptTurn],
  );

  const handleResolveApproval = useCallback(
    (_approvalId: string, _decision: ApprovalDecision) => {
      if (!activeTurnId) return;
    },
    [activeTurnId],
  );

  const handleAnswerQuestion = useCallback(
    (_questionId: string, answer: string) => {
      if (!activeTurnId) return;

      answerQuestion(activeTurnId, answer);

      const pending = pendingIssues[activeTurnId];
      if (!pending) return;

      if (answer === "file") {
        void infraService
          .executeAction({
            action: "create-issue",
            params: { title: pending.title, body: pending.body },
          })
          .then((result) => {
            let responseText: string;
            if (result.ok) {
              const issueResult = result.data as CreateIssueResult;
              responseText = intl.formatMessage(
                { id: "issues.created" },
                { url: issueResult.url },
              );
            } else {
              responseText = intl.formatMessage(
                { id: "issues.createFailed" },
                { detail: translateMessage(intl, result.error) || intl.formatMessage({ id: "infra.unknownError" }) },
              );
            }
            appendAssistantContent(activeTurnId!, responseText);
            finishTurn(activeTurnId!);
            setActiveTurnId(null);
            setPendingIssues((prev) => {
              const next = { ...prev };
              delete next[activeTurnId!];
              return next;
            });
          });
      } else {
        appendAssistantContent(activeTurnId, intl.formatMessage({ id: "issues.optionCancel" }));
        finishTurn(activeTurnId);
        setActiveTurnId(null);
        setPendingIssues((prev) => {
          const next = { ...prev };
          delete next[activeTurnId!];
          return next;
        });
      }
    },
    [activeTurnId, answerQuestion, pendingIssues, infraService, intl, appendAssistantContent, finishTurn],
  );

  const handleAccessModeChange = useCallback(
    (mode: AccessMode) => {
      setAccessMode(mode);
      if (activeTurnId) {
        setTurnAccessMode(activeTurnId, mode);
      }
    },
    [activeTurnId, setTurnAccessMode],
  );

  const handleDraftChange = useCallback(
    (turnId: string | null, text: string) => {
      const key = turnId ?? "__infra-new";
      setDrafts((prev) => ({ ...prev, [key]: text }));
    },
    [],
  );

  return (
    <div className="infra-chat-panel">
      <div className="infra-chat-title">
        <Server size={14} />
        <span>{intl.formatMessage({ id: "infra.title" })}</span>
        <span className="infra-chat-vm">{mainVmName}</span>
      </div>

      <div className="infra-chat-scroll" ref={scrollRef}>
        {rows.length === 0 ? (
          <div className="infra-chat-empty">
            <p>{intl.formatMessage({ id: "infra.description" })}</p>
          </div>
        ) : (
          rows.map((row) => {
            switch (row.kind) {
              case "user-message":
                return (
                  <div key={row.id} className="transcript-user-msg">
                    <div className="transcript-avatar infra-user-avatar">{intl.formatMessage({ id: "infra.userInitials" })}</div>
                    <div className="transcript-msg-body">
                      <Suspense fallback={null}>
                        <MarkdownContent content={row.content} />
                      </Suspense>
                    </div>
                  </div>
                );
              case "assistant-message":
                return (
                  <div key={row.id} className="transcript-assistant-msg">
                    <div className="transcript-avatar infra-assistant-avatar">{intl.formatMessage({ id: "infra.botInitials" })}</div>
                    <div className="transcript-msg-body">
                      <Suspense fallback={null}>
                        <MarkdownContent content={row.content} streaming={row.streaming} />
                      </Suspense>
                    </div>
                  </div>
                );
              case "question-request":
                return (
                  <div key={row.id} className="transcript-question-row">
                    <QuestionPanel
                      question={row.question}
                      onAnswer={handleAnswerQuestion}
                    />
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
