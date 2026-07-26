import type { TFunction } from "i18next";
import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cid, useInject } from "inversify-hooks";
import type { ChatTurn, AccessMode } from "../chat/types";
import type { InfraActionArgs, MachineStatusEntry, CreateIssueResult, ListIssuesResult, AddLabelResult, EditIssueResult, BulkRelabelResult, IssueCard } from "../../../shared/ipc";
import type { IInfraService, IConfigService } from "../services/interfaces";
import { useTranscript } from "../chat/useTranscript";
import { ChatComposer } from "../chat/ChatComposer";

const MarkdownContent = lazy(() =>
  import("../chat/MarkdownContent").then((m) => ({ default: m.MarkdownContent })),
);
import { Server } from "lucide-react";
import type { ApprovalDecision } from "../chat/types";
import { QuestionPanel } from "../chat/QuestionPanel";
import { ToolCallInlineBlock } from "../chat/ToolCallInlineBlock";
import { ToolCallsExpander } from "../chat/ToolCallsExpander";
import { TurnFold } from "../chat/TurnFold";
import { translateMessage } from "../i18n";

interface InfraChatPanelProps {
  mainVmId: string;
  mainVmName: string;
}

/** Escape markdown special characters and strip HTML-like tags from untrusted strings
 *  before interpolation into markdown content, preventing XSS via daemon-controlled data. */
function escapeMd(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[*_~`#[\]|\\]/g, (ch) => `\\${ch}`);
}

function formatMachineStatusReport(t: TFunction, data: unknown): string {
  if (!Array.isArray(data)) return t("infra.noData");
  const lines: string[] = [`## ${t("infra.fleetStatusHeader")}\n`];
  for (const machine of data as MachineStatusEntry[]) {
    const icon = machine.health === "connected" ? "🟢" : machine.health === "offline" ? "🔴" : "🟡";
    lines.push(`**${escapeMd(machine.name)}** ${icon} \`${escapeMd(machine.health)}\``);
    for (const ep of machine.endpoints) {
      lines.push(`  - ${escapeMd(ep.kind)}: \`${escapeMd(ep.url)}\``);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function formatIssueStack(t: TFunction, data: unknown): string {
  const result = data as ListIssuesResult;
  if (!result?.issues || result.issues.length === 0) {
    return t("issues.stackEmpty");
  }

  const labelFilter = result.issues.length > 0 && result.issues[0].labels.length > 0
    ? escapeMd(result.issues[0].labels[0])
    : undefined;

  const lines: string[] = [
    t("issues.stackTitle", { count: result.issues.length, label: labelFilter ?? false, state: "open" }),
    "",
  ];

  for (const issue of result.issues) {
    const labelChips = issue.labels.length > 0
      ? " " + issue.labels.map((l) => `\`${escapeMd(l)}\``).join(" ")
      : "";
    lines.push(`- [#${issue.number}](issue://${issue.number}) ${escapeMd(issue.title)}${labelChips}`);
  }

  if (result.truncated) {
    lines.push(t("issues.stackTruncated", { shown: result.issues.length, total: result.total }));
  }

  return lines.join("\n");
}

export function InfraChatPanel({ mainVmId, mainVmName }: InfraChatPanelProps): React.ReactNode {
  const { t } = useTranslation();
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
  } = useTranscript(null);

  const [accessMode, setAccessMode] = useState<AccessMode>("supervised");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  /** Pending issue drafts keyed by turnId, awaiting user confirmation */
  const [pendingIssues, setPendingIssues] = useState<Record<string, { title: string; body: string }>>({});
  /** Pending issue edits keyed by turnId, awaiting user confirmation */
  const [pendingEdits, setPendingEdits] = useState<Record<string, { issueNumber: number; title?: string; body?: string; addLabels?: string[]; removeLabels?: string[]; repo?: string }>>({});
  /** Pending label offers keyed by turnId, awaiting user acceptance */
  const [pendingLabelOffers, setPendingLabelOffers] = useState<Record<string, { issueNumber: number; labels: string[]; repo?: string }>>({});
  /** Last issue list returned by a list-issues query, used for "mark these as X" resolution */
  const lastIssueListRef = useRef<IssueCard[]>([]);
  /** Pending bulk relabels keyed by turnId, awaiting user confirmation */
  const [pendingBulkRelabels, setPendingBulkRelabels] = useState<Record<string, { issueNumbers: number[]; addLabels: string[]; removeLabels?: string[]; repo?: string; issueTitles: Map<number, string> }>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Map from issue number to URL, used for issue:// link click-through */
  const issueUrlMap = useRef<Map<number, string>>(new Map());
  /** Active streaming interval reference, cleaned up on unmount */
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Clean up streaming interval on unmount to prevent state updates on unmounted component
  useEffect(() => {
    return () => {
      if (streamIntervalRef.current) {
        clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
      }
    };
  }, []);

  const handleSendPrompt = useCallback(
    (text: string) => {
      const now = Date.now();
      const turnId = `infra-turn-${now}`;
      const lower = text.toLowerCase();

      // Detect "set pickup label" intent
      const setPickupLabelMatch = text.match(/^set\s+pickup\s+label\s+(?:to\s+)?[:\-]?\s*([a-zA-Z0-9\-_,\s]+)/i);
      const isClearPickupLabel = lower.includes("clear pickup label") || lower.includes("remove pickup label");
      const isShowPickupLabel = lower === "pickup label" || lower === "show pickup label" || lower === "what pickup label" || lower === "what's the pickup label" || lower === "whats the pickup label";

      if (setPickupLabelMatch || isClearPickupLabel || isShowPickupLabel) {
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

        if (isClearPickupLabel) {
          void configService.setProjectPickupLabels("__default__", []).then(() => {
            const responseText = t("labels.clearedPickupLabel");
            appendAssistantContent(turnId, responseText);
            finishTurn(turnId);
            setActiveTurnId(null);
          });
        } else if (setPickupLabelMatch) {
          // Parse labels: split by comma, trim each
          const rawLabels = setPickupLabelMatch[1].split(",").map((l) => l.trim()).filter((l) => l.length > 0);
          void configService.setProjectPickupLabels("__default__", rawLabels).then(() => {
            const responseText = t(
              "labels.setPickupLabel",
              { labels: rawLabels.join("`, `") },
            );
            appendAssistantContent(turnId, responseText);
            finishTurn(turnId);
            setActiveTurnId(null);
          });
        } else {
          // Show current pickup label
          void configService.getProjectPickupLabels("__default__").then((labels) => {
            const responseText = labels.length > 0
              ? t("labels.currentPickupLabel", { labels: labels.join("`, `") })
              : t("labels.noPickupLabel");
            appendAssistantContent(turnId, responseText);
            finishTurn(turnId);
            setActiveTurnId(null);
          });
        }
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
              content: t("issues.titleRequired"),
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

        const draftPreview = `**${t("issues.draftTitle")}**\n\n### ${title}\n\n${body}`;
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
            text: t("issues.fileQuestion"),
            options: [
              { key: "file", label: t("issues.optionFile") },
              { key: "cancel", label: t("issues.optionCancel") },
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

      // Detect "edit issue" / "update issue" intent
      const isEditIssue =
        lower.includes("edit issue") ||
        lower.includes("update issue") ||
        lower.includes("rename issue") ||
        lower.includes("change issue") ||
        (lower.includes("issue") && (lower.includes("add label") || lower.includes("remove label")));

      if (isEditIssue) {
        // Extract issue number from text (e.g. "#42", "issue 42", "issue #42")
        const numberMatch = text.match(/#(\d+)/) || text.match(/issue\s+(\d+)/i);
        if (!numberMatch) {
          // Ambiguous reference: no issue number found
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
              content: t("editIssue.ambiguousReference"),
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

        const issueNumber = parseInt(numberMatch[1], 10);

        // Extract title change: "rename issue #42 to New Title" or "edit issue #42 title: New Title"
        let newTitle: string | undefined;
        const renameMatch = text.match(/(?:rename|change)\s+issue\s+(?:#\d+|\d+)\s+(?:to\s+)?[:\-]?\s*(.+)/i);
        const titleMatch2 = text.match(/title\s*[:\-]\s*(.+)/i);
        if (renameMatch) {
          newTitle = renameMatch[1].trim();
        } else if (titleMatch2) {
          newTitle = titleMatch2[1].trim();
        }

        // Extract body change: "body: description text"
        let newBody: string | undefined;
        const bodyMatch = text.match(/body\s*[:\-]\s*(.+)/i);
        if (bodyMatch) {
          newBody = bodyMatch[1].trim();
        }

        // Extract label add: "add label bug,feature" or "add labels bug, feature"
        let addLabels: string[] | undefined;
        const addLabelMatch = text.match(/add\s+labels?\s+[:\-]?\s*([a-zA-Z0-9\-_,\s]+)/i);
        if (addLabelMatch) {
          addLabels = addLabelMatch[1].split(",").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
        }

        // Extract label remove: "remove label bug" or "remove labels bug, feature"
        let removeLabels: string[] | undefined;
        const removeLabelMatch = text.match(/remove\s+labels?\s+[:\-]?\s*([a-zA-Z0-9\-_,\s]+)/i);
        if (removeLabelMatch) {
          removeLabels = removeLabelMatch[1].split(",").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
        }

        // Check if any changes were specified
        if (!newTitle && !newBody && !addLabels?.length && !removeLabels?.length) {
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
              content: t("editIssue.noChanges"),
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

        // Build preview of proposed changes
        const changeLines: string[] = [];
        if (newTitle) {
          changeLines.push(t("editIssue.changeTitle", { old: "...", new: newTitle }));
        }
        if (newBody) {
          changeLines.push(t("editIssue.changeBody"));
        }
        if (addLabels?.length) {
          changeLines.push(t("editIssue.changeAddLabels", { labels: addLabels.map((l: string) => `\`${l}\``).join(" ") }));
        }
        if (removeLabels?.length) {
          changeLines.push(t("editIssue.changeRemoveLabels", { labels: removeLabels.map((l: string) => `\`${l}\``).join(" ") }));
        }

        const previewText = t(
          "editIssue.previewChanges",
          { number: issueNumber, changes: changeLines.join("\n") },
        );

        const questionId = `edit-q-${now}`;
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
            content: previewText,
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
            text: t("editIssue.applyQuestion"),
            options: [
              { key: "apply-edit", label: t("editIssue.optionApply") },
              { key: "cancel-edit", label: t("editIssue.optionCancel") },
            ],
            singleChoice: true,
            allowFreeText: false,
            resolved: false,
          },
        };
        addTurn(turn);
        setActiveTurnId(turnId);
        setPendingEdits((prev) => ({ ...prev, [turnId]: { issueNumber, title: newTitle, body: newBody, addLabels, removeLabels } }));
        return;
      }

      // Detect "mark these as X" / "relabel these as X" / "add label X to these" intent
      const isBulkRelabel =
        (lower.includes("mark") && (lower.includes(" as ") || lower.includes(" these") || lower.includes(" those"))) ||
        (lower.includes("relabel") && (lower.includes(" as ") || lower.includes(" these") || lower.includes(" those"))) ||
        (lower.includes("label") && (lower.includes(" these") || lower.includes(" those") || lower.includes(" all"))) ||
        (lower.includes("add label") && (lower.includes(" these") || lower.includes(" those") || lower.includes(" all"))) ||
        lower.includes("mark all as") ||
        lower.includes("relabel all as");

      if (isBulkRelabel) {
        // Extract labels from patterns like:
        // "mark these as to-refine" / "relabel these as bug" / "mark all as to-implement"
        // "add label bug to these" / "label these as feature"
        let addLabels: string[] = [];
        const asMatch = text.match(/(?:mark|relabel|label)\s+(?:these|those|all)\s+as\s+[:\-]?\s*([a-zA-Z0-9\-_,\s]+)/i);
        const addLabelToMatch = text.match(/add\s+labels?\s+[:\-]?\s*([a-zA-Z0-9\-_,\s]+)\s+to\s+(?:these|those|all)/i);

        if (asMatch) {
          addLabels = asMatch[1].split(",").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
        } else if (addLabelToMatch) {
          addLabels = addLabelToMatch[1].split(",").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
        }

        if (addLabels.length === 0) {
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
              content: t("bulkRelabel.noLabelSpecified"),
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

        // Resolve issue set from the last listed issues
        const lastIssues = lastIssueListRef.current;
        if (lastIssues.length === 0) {
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
              content: t("bulkRelabel.noIssuesInContext"),
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

        // Build the confirmation card listing every affected issue
        const issueNumbers = lastIssues.map((iss) => iss.number);
        const issueTitles = new Map(lastIssues.map((iss) => [iss.number, iss.title]));

        const issueListLines = lastIssues.map(
          (iss) => `- [#${iss.number}](issue://${iss.number}) ${escapeMd(iss.title)}`,
        );

        const previewText = t(
          "bulkRelabel.preview",
          {
            count: issueNumbers.length,
            labels: addLabels.map((l: string) => `\`${l}\``).join(" "),
            issueList: issueListLines.join("\n"),
          },
        );

        const questionId = `bulk-relabel-q-${now}`;
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
            content: previewText,
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
            text: t("bulkRelabel.applyQuestion"),
            options: [
              { key: "apply-bulk-relabel", label: t("bulkRelabel.optionApply") },
              { key: "cancel-bulk-relabel", label: t("bulkRelabel.optionCancel") },
            ],
            singleChoice: true,
            allowFreeText: false,
            resolved: false,
          },
        };
        addTurn(turn);
        setActiveTurnId(turnId);
        setPendingBulkRelabels((prev) => ({ ...prev, [turnId]: { issueNumbers, addLabels, issueTitles } }));
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
              responseText = formatMachineStatusReport(t, result.data);
            } else if (action!.action === "clone-repo") {
              responseText = t("infra.cloneInitiated", { data: JSON.stringify(result.data, null, 2) });
            } else if (action!.action === "list-issues") {
              responseText = formatIssueStack(t, result.data);
              // Register issue URLs for click-through
              const issueResult = result.data as ListIssuesResult;
              if (issueResult?.issues) {
                for (const issue of issueResult.issues) {
                  issueUrlMap.current.set(issue.number, issue.url);
                }
                // Store the last-listed issues for "mark these as X" resolution
                lastIssueListRef.current = issueResult.issues;
              }
            } else {
              responseText = JSON.stringify(result.data, null, 2);
            }
          } else {
            responseText = t("infra.errorMessage", { detail: translateMessage(result.error) || t("infra.unknownError") });
          }
          appendAssistantContent(turnId, responseText);
          finishTurn(turnId);
          setActiveTurnId(null);
        });
      } else {
        const fallback = t("infra.helpText");
        let idx = 0;
        const interval = setInterval(() => {
          const chunkSize = Math.floor(Math.random() * 6) + 3;
          const chunk = fallback.slice(idx, idx + chunkSize);
          idx += chunkSize;
          appendAssistantContent(turnId, chunk);
          if (idx >= fallback.length) {
            clearInterval(interval);
            streamIntervalRef.current = null;
            finishTurn(turnId);
            setActiveTurnId(null);
          }
        }, 30);
        streamIntervalRef.current = interval;
      }
    },
    [accessMode, addTurn, appendAssistantContent, finishTurn, infraService, configService],
  );

  const handleInterrupt = useCallback(
    (turnId: string) => {
      if (streamIntervalRef.current) {
        clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
      }
      interruptTurn(turnId);
      setActiveTurnId(null);
    },
    [interruptTurn],
  );

  const handleResolveApproval = useCallback(
    (approvalId: string, decision: ApprovalDecision) => {
      if (!activeTurnId) return;

      // Find the turn that owns this approval so we can resolve + finish it
      const turn = turns.find((t) => t.approval?.id === approvalId);
      const turnId = turn?.id ?? activeTurnId;

      resolveApproval(turnId, decision);
      finishTurn(turnId);
      setActiveTurnId(null);
    },
    [activeTurnId, turns, resolveApproval, finishTurn],
  );

  const handleAnswerQuestion = useCallback(
    (_questionId: string, answer: string) => {
      if (!activeTurnId) return;

      answerQuestion(activeTurnId, answer);

      // Check for pending label offer first
      const pendingLabel = pendingLabelOffers[activeTurnId];
      if (pendingLabel) {
        if (answer === "apply-label") {
          void infraService
            .executeAction({
              action: "add-label",
              params: { issueNumber: pendingLabel.issueNumber, labels: pendingLabel.labels, repo: pendingLabel.repo },
            })
            .then((result) => {
              let responseText: string;
              if (result.ok) {
                const labelResult = result.data as AddLabelResult;
                responseText = t(
                  "labels.applied",
                  { labels: labelResult.labels.join("`, `"), number: labelResult.issueNumber },
                );
              } else {
                responseText = t(
                  "labels.applyFailed",
                  { detail: translateMessage( result.error) || t("infra.unknownError") },
                );
              }
              appendAssistantContent(activeTurnId!, responseText);
              finishTurn(activeTurnId!);
              setActiveTurnId(null);
              setPendingLabelOffers((prev) => {
                const next = { ...prev };
                delete next[activeTurnId!];
                return next;
              });
            });
        } else {
          // Skip label
          appendAssistantContent(activeTurnId, t("labels.optionSkip"));
          finishTurn(activeTurnId);
          setActiveTurnId(null);
          setPendingLabelOffers((prev) => {
            const next = { ...prev };
            delete next[activeTurnId!];
            return next;
          });
        }
        return;
      }

      // Check for pending edit-issue confirmation
      const pendingEdit = pendingEdits[activeTurnId];
      if (pendingEdit) {
        if (answer === "apply-edit") {
          void infraService
            .executeAction({
              action: "edit-issue",
              params: {
                issueNumber: pendingEdit.issueNumber,
                title: pendingEdit.title,
                body: pendingEdit.body,
                addLabels: pendingEdit.addLabels,
                removeLabels: pendingEdit.removeLabels,
                repo: pendingEdit.repo,
              },
            })
            .then((result) => {
              let responseText: string;
              if (result.ok) {
                const editResult = result.data as EditIssueResult;
                const summaryParts: string[] = [];
                if (editResult.changes.title) summaryParts.push(t("editIssue.summaryTitle"));
                if (editResult.changes.body) summaryParts.push(t("editIssue.summaryBody"));
                if (editResult.changes.labelsAdded?.length) summaryParts.push(t("editIssue.summaryLabelsAdded", { labels: editResult.changes.labelsAdded.join("`, `") }));
                if (editResult.changes.labelsRemoved?.length) summaryParts.push(t("editIssue.summaryLabelsRemoved", { labels: editResult.changes.labelsRemoved.join("`, `") }));
                responseText = t(
                  "editIssue.applied",
                  { number: editResult.issueNumber, summary: summaryParts.join(", ") },
                );
              } else {
                responseText = t(
                  "editIssue.editFailed",
                  { detail: translateMessage( result.error) || t("infra.unknownError") },
                );
              }
              appendAssistantContent(activeTurnId!, responseText);
              finishTurn(activeTurnId!);
              setActiveTurnId(null);
              setPendingEdits((prev) => {
                const next = { ...prev };
                delete next[activeTurnId!];
                return next;
              });
            });
        } else {
          // Cancel edit
          appendAssistantContent(activeTurnId, t("editIssue.optionCancel"));
          finishTurn(activeTurnId);
          setActiveTurnId(null);
          setPendingEdits((prev) => {
            const next = { ...prev };
            delete next[activeTurnId!];
            return next;
          });
        }
        return;
      }

      // Check for pending bulk relabel confirmation
      const pendingBulk = pendingBulkRelabels[activeTurnId];
      if (pendingBulk) {
        if (answer === "apply-bulk-relabel") {
          void infraService
            .executeAction({
              action: "bulk-relabel",
              params: {
                issueNumbers: pendingBulk.issueNumbers,
                addLabels: pendingBulk.addLabels,
                removeLabels: pendingBulk.removeLabels,
                repo: pendingBulk.repo,
              },
            })
            .then((result) => {
              let responseText: string;
              if (result.ok) {
                const bulkResult = result.data as BulkRelabelResult;

                // Build per-item result lines
                const itemLines: string[] = [];
                for (const item of bulkResult.items) {
                  const title = pendingBulk.issueTitles.get(item.issueNumber) ?? `#${item.issueNumber}`;
                  if (item.ok) {
                    itemLines.push(`- ✓ [#${item.issueNumber}](issue://${item.issueNumber}) ${escapeMd(title)}`);
                  } else {
                    itemLines.push(`- ✗ [#${item.issueNumber}](issue://${item.issueNumber}) ${escapeMd(title)} — ${escapeMd(item.error ?? "unknown error")}`);
                  }
                }

                if (bulkResult.failed === 0) {
                  responseText = t(
                    "bulkRelabel.allApplied",
                    {
                      count: bulkResult.succeeded,
                      labels: pendingBulk.addLabels.map((l) => `\`${l}\``).join(" "),
                      itemLines: itemLines.join("\n"),
                    },
                  );
                } else {
                  responseText = t(
                    "bulkRelabel.partiallyApplied",
                    {
                      succeeded: bulkResult.succeeded,
                      failed: bulkResult.failed,
                      labels: pendingBulk.addLabels.map((l) => `\`${l}\``).join(" "),
                      itemLines: itemLines.join("\n"),
                    },
                  );
                }
              } else {
                responseText = t(
                  "bulkRelabel.applyFailed",
                  { detail: translateMessage( result.error) || t("infra.unknownError") },
                );
              }
              appendAssistantContent(activeTurnId!, responseText);
              finishTurn(activeTurnId!);
              setActiveTurnId(null);
              setPendingBulkRelabels((prev) => {
                const next = { ...prev };
                delete next[activeTurnId!];
                return next;
              });
            });
        } else {
          // Cancel bulk relabel
          appendAssistantContent(activeTurnId, t("bulkRelabel.optionCancel"));
          finishTurn(activeTurnId);
          setActiveTurnId(null);
          setPendingBulkRelabels((prev) => {
            const next = { ...prev };
            delete next[activeTurnId!];
            return next;
          });
        }
        return;
      }

      const pending = pendingIssues[activeTurnId];
      if (!pending) return;

      if (answer === "file") {
        void infraService
          .executeAction({
            action: "create-issue",
            params: { title: pending.title, body: pending.body },
          })
          .then(async (result) => {
            let responseText: string;
            if (result.ok) {
              const issueResult = result.data as CreateIssueResult;
              responseText = t(
                "issues.created",
                { url: issueResult.url },
              );

              // Check if pickup labels are configured for this project
              const pickupLabels = await configService.getProjectPickupLabels("__default__");
              if (pickupLabels.length > 0 && issueResult.number) {
                // Finish this response, then offer the pickup label as a new question
                appendAssistantContent(activeTurnId!, responseText);

                // Add a follow-up question offering the pickup label
                const labelQuestionId = `label-q-${Date.now()}`;
                const labelsStr = pickupLabels.join("`, `");
                // We need to add a new question on the same turn
                // The turn already has a question resolved, but we can append content + new question
                appendAssistantContent(
                  activeTurnId!,
                  "\n\n" + t(
                    "labels.pickupOffer",
                    { labels: labelsStr, number: issueResult.number },
                  ),
                );

                // Track the pending label offer
                setPendingLabelOffers((prev) => ({
                  ...prev,
                  [activeTurnId!]: { issueNumber: issueResult.number!, labels: pickupLabels },
                }));

                // We need to set a new question on the turn — but useTranscript
                // doesn't support updating a turn's question after creation.
                // Instead, we'll finish this turn and start a new turn for the label offer.
                // However, the simpler approach is to keep the turn open with a new question.
                // Since the existing architecture creates a turn with a question, let's create
                // a child turn for the label offer.

                const labelTurnId = `infra-label-turn-${Date.now()}`;
                const labelTurn: ChatTurn = {
                  id: labelTurnId,
                  userMessage: {
                    id: `infra-msg-${Date.now()}-u`,
                    role: "user",
                    content: t(
                      "labels.pickupOffer",
                      { labels: labelsStr, number: issueResult.number },
                    ),
                    startedAt: Date.now(),
                  },
                  assistantMessage: {
                    id: `infra-msg-${Date.now()}-a`,
                    role: "assistant",
                    content: "",
                    toolCalls: [],
                    startedAt: Date.now() + 100,
                    finishedAt: undefined,
                  },
                  finished: false,
                  collapsed: false,
                  accessMode,
                  question: {
                    id: labelQuestionId,
                    turnId: labelTurnId,
                    text: t(
                      "labels.pickupOffer",
                      { labels: labelsStr, number: issueResult.number },
                    ),
                    options: [
                      { key: "apply-label", label: t("labels.optionApply") },
                      { key: "skip-label", label: t("labels.optionSkip") },
                    ],
                    singleChoice: true,
                    allowFreeText: false,
                    resolved: false,
                  },
                };
                finishTurn(activeTurnId!);
                addTurn(labelTurn);
                setActiveTurnId(labelTurnId);
                setPendingLabelOffers((prev) => {
                  const next = { ...prev };
                  delete next[activeTurnId!];
                  return { ...next, [labelTurnId]: { issueNumber: issueResult.number!, labels: pickupLabels } };
                });
              } else {
                appendAssistantContent(activeTurnId!, responseText);
                finishTurn(activeTurnId!);
                setActiveTurnId(null);
              }
            } else {
              responseText = t(
                "issues.createFailed",
                { detail: translateMessage( result.error) || t("infra.unknownError") },
              );
              appendAssistantContent(activeTurnId!, responseText);
              finishTurn(activeTurnId!);
              setActiveTurnId(null);
            }
            setPendingIssues((prev) => {
              const next = { ...prev };
              delete next[activeTurnId!];
              return next;
            });
          });
      } else {
        appendAssistantContent(activeTurnId, t("issues.optionCancel"));
        finishTurn(activeTurnId);
        setActiveTurnId(null);
        setPendingIssues((prev) => {
          const next = { ...prev };
          delete next[activeTurnId!];
          return next;
        });
      }
    },
    [activeTurnId, answerQuestion, pendingIssues, pendingEdits, pendingLabelOffers, pendingBulkRelabels, infraService, configService, appendAssistantContent, finishTurn, addTurn, accessMode],
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
      const key = turnId ?? "__new";
      setDrafts((prev) => ({ ...prev, [key]: text }));
    },
    [],
  );

  return (
    <div className="infra-chat-panel">
      <div className="infra-chat-title">
        <Server size={14} />
        <span>{t("infra.title")}</span>
        <span className="infra-chat-vm">{mainVmName}</span>
      </div>

      <div className="infra-chat-scroll" ref={scrollRef}>
        {rows.length === 0 ? (
          <div className="infra-chat-empty">
            <p>{t("infra.description")}</p>
          </div>
        ) : (
          rows.map((row) => {
            switch (row.kind) {
              case "user-message":
                return (
                  <div key={row.id} className="transcript-user-msg">
                    <div className="transcript-avatar infra-user-avatar">{t("infra.userInitials")}</div>
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
                    <div className="transcript-avatar infra-assistant-avatar">{t("infra.botInitials")}</div>
                    <div className="transcript-msg-body">
                      <Suspense fallback={null}>
                        <MarkdownContent content={row.content} streaming={row.streaming} />
                      </Suspense>
                    </div>
                  </div>
                );
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
