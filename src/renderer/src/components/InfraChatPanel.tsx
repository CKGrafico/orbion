import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useIntl, type IntlShape } from "react-intl";
import { cid, useInject } from "inversify-hooks";
import type { ChatTurn, AccessMode } from "../types";
import type { InfraActionArgs, MachineStatusEntry, CreateIssueResult, ListIssuesResult } from "../../../shared/ipc";
import type { IInfraService } from "../services/interfaces";
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

function formatIssueStack(intl: IntlShape, data: unknown): string {
  const result = data as ListIssuesResult;
  if (!result?.issues || result.issues.length === 0) {
    return intl.formatMessage({ id: "issues.stackEmpty" });
  }

  const labelFilter = result.issues.length > 0 && result.issues[0].labels.length > 0
    ? result.issues[0].labels[0]
    : undefined;

  const lines: string[] = [
    intl.formatMessage(
      { id: "issues.stackTitle" },
      { count: result.issues.length, label: labelFilter ?? false, state: "open" },
    ),
    "",
  ];

  for (const issue of result.issues) {
    const labelChips = issue.labels.length > 0
      ? " " + issue.labels.map((l) => `\`${l}\``).join(" ")
      : "";
    lines.push(`- [#${issue.number}](issue://${issue.number}) ${issue.title}${labelChips}`);
  }

  if (result.truncated) {
    lines.push(intl.formatMessage({ id: "issues.stackTruncated" }, { shown: result.issues.length, total: result.total }));
  }

  return lines.join("\n");
}

export function InfraChatPanel({ mainVmId, mainVmName }: InfraChatPanelProps): React.ReactNode {
  const intl = useIntl();
  const [infraService] = useInject<IInfraService>(cid.IInfraService);
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

  const [accessMode, setAccessMode] = useState<AccessMode>("supervised");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  /** Pending issue drafts keyed by turnId, awaiting user confirmation */
  const [pendingIssues, setPendingIssues] = useState<Record<string, { title: string; body: string }>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Map from issue number to URL, used for issue:// link click-through */
  const issueUrlMap = useRef<Map<number, string>>(new Map());

  // Intercept clicks on issue:// links in the chat scroll area
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleClick = (e: MouseEvent): void => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (!href.startsWith("issue://")) return;

      e.preventDefault();
      const numberStr = href.slice("issue://".length);
      const number = parseInt(numberStr, 10);
      const url = issueUrlMap.current.get(number);
      if (url) {
        window.open(url, "_blank", "noopener");
      }
    };

    el.addEventListener("click", handleClick);
    return () => el.removeEventListener("click", handleClick);
  }, []);

  const handleSendPrompt = useCallback(
    (text: string) => {
      const now = Date.now();
      const turnId = `infra-turn-${now}`;
      const lower = text.toLowerCase();

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

      // Detect "list issues" / backlog query intent
      const isListIssues =
        lower.includes("list issue") ||
        lower.includes("show issue") ||
        lower.includes("what's labeled") ||
        lower.includes("whats labeled") ||
        lower.includes("labeled ") ||
        lower.includes("backlog") ||
        lower.includes("ready to implement") ||
        lower.includes("to-implement") ||
        (lower.includes("issue") && (lower.includes("filter") || lower.includes("query") || lower.includes("search"))) ||
        (lower.includes("what") && lower.includes("issue"));

      if (lower.includes("status") || lower.includes("health") || lower.includes("machine")) {
        action = { action: "machine-status" };
      } else if (lower.includes("clone") || lower.includes("repo")) {
        const repoMatch = text.match(/(https?:\/\/[^\s]+)/);
        action = { action: "clone-repo", params: { repoUrl: repoMatch?.[1] ?? "" } };
      } else if (isListIssues) {
        // Extract label filter from text (e.g. "what's labeled to-implement?" → "to-implement")
        let labels: string | undefined;
        const labelMatch = text.match(/labeled\s+[:\-]?\s*([a-zA-Z0-9\-_]+)/i);
        if (labelMatch) {
          labels = labelMatch[1];
        } else if (lower.includes("to-implement")) {
          labels = "to-implement";
        }

        action = { action: "list-issues", params: { labels, state: "open" } };
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
            } else if (action!.action === "list-issues") {
              responseText = formatIssueStack(intl, result.data);
              // Register issue URLs for click-through
              const issueResult = result.data as ListIssuesResult;
              if (issueResult?.issues) {
                for (const issue of issueResult.issues) {
                  issueUrlMap.current.set(issue.number, issue.url);
                }
              }
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
    [intl, accessMode, addTurn, appendAssistantContent, finishTurn, infraService],
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
