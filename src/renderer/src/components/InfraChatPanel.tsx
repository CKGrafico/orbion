import React, { useCallback, useRef, useState } from "react";
import type { ChatTurn, AccessMode } from "../types";
import type { InfraActionArgs } from "../../../shared/ipc";
import { useTranscript } from "../chat/useTranscript";
import { MarkdownContent } from "../chat/MarkdownContent";
import { ChatComposer } from "../chat/ChatComposer";
import { Icon } from "./Icon";
import type { ApprovalDecision, ApprovalRequest, QuestionRequest } from "../chat/types";

interface InfraChatPanelProps {
  mainVmId: string;
  mainVmName: string;
}

function formatMachineStatusReport(data: unknown): string {
  if (!Array.isArray(data)) return "No machine data available.";
  const lines: string[] = ["## Fleet Status\n"];
  for (const machine of data as Array<{ id: string; name: string; health: string; endpoints: Array<{ url: string; kind: string }> }>) {
    const icon = machine.health === "connected" ? "🟢" : machine.health === "offline" ? "🔴" : "🟡";
    lines.push(`**${machine.name}** ${icon} \`${machine.health}\``);
    for (const ep of machine.endpoints) {
      lines.push(`  - ${ep.kind}: \`${ep.url}\``);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function InfraChatPanel({ mainVmId, mainVmName }: InfraChatPanelProps): React.ReactNode {
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
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSendPrompt = useCallback(
    (text: string) => {
      const now = Date.now();
      const turnId = `infra-turn-${now}`;
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

      const lower = text.toLowerCase();
      let action: InfraActionArgs | null = null;

      if (lower.includes("status") || lower.includes("health") || lower.includes("machine")) {
        action = { action: "machine-status" };
      } else if (lower.includes("clone") || lower.includes("repo")) {
        const repoMatch = text.match(/(https?:\/\/[^\s]+)/);
        action = { action: "clone-repo", params: { repoUrl: repoMatch?.[1] ?? "" } };
      }

      if (action && window.api) {
        void window.api.infra.executeAction(action).then((result) => {
          if (!result) return;
          let responseText: string;
          if (result.ok) {
            if (action!.action === "machine-status") {
              responseText = formatMachineStatusReport(result.data);
            } else if (action!.action === "clone-repo") {
              responseText = `## Clone initiated\n\n${JSON.stringify(result.data, null, 2)}`;
            } else {
              responseText = JSON.stringify(result.data, null, 2);
            }
          } else {
            responseText = `**Error:** ${result.error ?? "Unknown error"}`;
          }
          appendAssistantContent(turnId, responseText);
          finishTurn(turnId);
          setActiveTurnId(null);
        });
      } else {
        const fallback = action
          ? "Unable to reach the infrastructure runtime. Check that the main VM is connected."
          : "I can help you with fleet operations. Try:\n- **machine-status** — get the health of all VMs\n- **clone repo** — clone a git repository on a VM";
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
    [accessMode, addTurn, appendAssistantContent, finishTurn],
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
    (_questionId: string, _answer: string) => {
      if (!activeTurnId) return;
    },
    [activeTurnId],
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
        <Icon name="server" size={14} />
        <span>Infrastructure</span>
        <span className="infra-chat-vm">{mainVmName}</span>
      </div>

      <div className="infra-chat-scroll" ref={scrollRef}>
        {rows.length === 0 ? (
          <div className="infra-chat-empty">
            <p>Ask about your fleet — machine status, clone repos, manage services.</p>
          </div>
        ) : (
          rows.map((row) => {
            switch (row.kind) {
              case "user-message":
                return (
                  <div key={row.id} className="transcript-user-msg">
                    <div className="transcript-avatar infra-user-avatar">U</div>
                    <div className="transcript-msg-body">
                      <MarkdownContent content={row.content} />
                    </div>
                  </div>
                );
              case "assistant-message":
                return (
                  <div key={row.id} className="transcript-assistant-msg">
                    <div className="transcript-avatar infra-assistant-avatar">INF</div>
                    <div className="transcript-msg-body">
                      <MarkdownContent content={row.content} streaming={row.streaming} />
                    </div>
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
