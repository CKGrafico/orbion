import React, { useCallback, useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { AccessMode, ApprovalDecision, ChatTurn, TranscriptRow } from "./types";
import { useTranscript } from "./useTranscript";
import { MarkdownContent, ToolCallRowView } from "./MarkdownContent";
import { ApprovalPanel } from "./ApprovalPanel";
import { QuestionPanel } from "./QuestionPanel";
import { ChatComposer } from "./ChatComposer";
import { ChevronDown, ArrowUp } from "lucide-react";

interface TranscriptViewProps {
  initialTurns: ChatTurn[];
  streamingTurn?: ChatTurn;
}

export function TranscriptView({
  initialTurns,
  streamingTurn,
}: TranscriptViewProps) {
  const intl = useIntl();
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [accessMode, setAccessMode] = useState<AccessMode>("supervised");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom =
      el.scrollTop + el.clientHeight >= el.scrollHeight - 60;
    isAtBottomRef.current = atBottom;
    setShowJump(!atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    isAtBottomRef.current = true;
    setShowJump(false);
  }, []);

  useEffect(() => {
    for (const turn of initialTurns) {
      addTurn(turn);
    }
  }, []);

  const streamingChunkIndexRef = useRef(0);
  const streamingContentRef = useRef(
    "I'm analyzing the codebase to understand the current architecture. Let me start by reading the relevant files.\n\n" +
    "After reviewing the project structure, here's my analysis:\n\n" +
    "The current architecture uses a three-process Electron model. The renderer is sandboxed and communicates " +
    "through a typed IPC bridge. All HTTP requests go through the main process proxy.\n\n" +
    "```typescript\n" +
    "interface TranscriptViewProps {\n" +
    "  initialTurns: ChatTurn[];\n" +
    "  streamingTurn?: ChatTurn;\n" +
    "}\n" +
    "```\n\n" +
    "The chat transcript view will integrate as a new section alongside loops, tasks, and projects. " +
    "It will use a row-based virtualized list to handle 500+ tool calls efficiently.\n\n" +
    "Key design decisions:\n" +
    "- Collapse/expand state lives in the row model, not component state\n" +
    "- Turn folding keeps finished turns compact\n" +
    "- Streaming text renders incrementally without re-rendering earlier rows\n" +
    "- Code blocks skip the highlight cache while streaming\n\n" +
    "This ensures smooth scrolling and proper virtualization even with thousands of rows.",
  );

  useEffect(() => {
    if (!streamingTurn) return;
    addTurn(streamingTurn);
    setActiveTurnId(streamingTurn.id);

    const content = streamingContentRef.current;
    let idx = 0;
    const interval = setInterval(() => {
      const chunkSize = Math.floor(Math.random() * 8) + 3;
      const chunk = content.slice(idx, idx + chunkSize);
      idx += chunkSize;
      appendAssistantContent(streamingTurn.id, chunk);
      if (idx >= content.length) {
        clearInterval(interval);
        finishTurn(streamingTurn.id);
        setActiveTurnId(null);
      }
    }, 30);

    return () => clearInterval(interval);
  }, [streamingTurn, addTurn, appendAssistantContent, finishTurn]);

  useEffect(() => {
    if (isAtBottomRef.current && scrollRef.current && rows.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [rows.length]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      if (!row) return 40;
      switch (row.kind) {
        case "user-message":
          return 48;
        case "assistant-message":
          return 80;
        case "tool-call":
          return row.expanded ? 140 : 36;
        case "tool-calls-expander":
          return 36;
        case "turn-fold":
          return 40;
        case "approval-request":
          return 120;
        case "question-request":
          return 100;
        default:
          return 40;
      }
    },
    overscan: 10,
  });

  const handleToggleCollapse = useCallback(
    (turnId: string) => {
      toggleTurnCollapse(turnId);
    },
    [toggleTurnCollapse],
  );

  const handleToggleTool = useCallback(
    (rowId: string) => {
      toggleToolExpand(rowId);
      setTimeout(() => virtualizer.measure(), 0);
    },
    [toggleToolExpand, virtualizer],
  );

  const handleSendPrompt = useCallback(
    (text: string) => {
      const now = Date.now();
      const turnId = `turn-${now}`;
      const turn: ChatTurn = {
        id: turnId,
        userMessage: {
          id: `msg-${now}-u`,
          role: "user",
          content: text,
          startedAt: now,
        },
        assistantMessage: {
          id: `msg-${now}-a`,
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

      const responseText = "Processing your request. I'll analyze the codebase and implement the changes as needed.\n\nLet me start by exploring the relevant files.";
      let idx = 0;
      const interval = setInterval(() => {
        const chunkSize = Math.floor(Math.random() * 8) + 3;
        const chunk = responseText.slice(idx, idx + chunkSize);
        idx += chunkSize;
        appendAssistantContent(turnId, chunk);
        if (idx >= responseText.length) {
          clearInterval(interval);
          finishTurn(turnId);
          setActiveTurnId(null);
        }
      }, 40);
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
    (approvalId: string, decision: ApprovalDecision) => {
      if (!activeTurnId) return;
      resolveApproval(activeTurnId, decision);
    },
    [activeTurnId, resolveApproval],
  );

  const handleAnswerQuestion = useCallback(
    (questionId: string, answer: string) => {
      if (!activeTurnId) return;
      answerQuestion(activeTurnId, answer);
    },
    [activeTurnId, answerQuestion],
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

  const renderRow = useCallback(
    (row: TranscriptRow) => {
      switch (row.kind) {
        case "user-message":
          return (
            <div className="transcript-user-msg">
              <div className="transcript-avatar user-avatar">{intl.formatMessage({ id: "chat.userInitials" })}</div>
              <div className="transcript-msg-body">
                <MarkdownContent content={row.content} />
              </div>
            </div>
          );

        case "assistant-message":
          return (
            <div className="transcript-assistant-msg">
              <div className="transcript-avatar assistant-avatar">{intl.formatMessage({ id: "chat.assistantInitials" })}</div>
              <div className="transcript-msg-body">
                <MarkdownContent
                  content={row.content}
                  streaming={row.streaming}
                />
              </div>
            </div>
          );

        case "tool-call":
          return (
            <ToolCallRowView
              toolCall={row.toolCall}
              expanded={row.expanded}
              onToggle={() => handleToggleTool(row.id)}
            />
          );

        case "tool-calls-expander":
          return (
            <button
              className="transcript-expander"
              onClick={() => handleToggleCollapse(row.turnId)}
            >
              <ChevronDown size={12} /> {intl.formatMessage({ id: "chat.earlierToolCalls" }, { count: row.count })}
            </button>
          );

        case "turn-fold":
          return (
            <button
              className="transcript-turn-fold"
              onClick={() => handleToggleCollapse(row.turnId)}
            >
              <ChevronDown size={12} /> {intl.formatMessage({ id: "chat.workedFor" }, { seconds: row.durationSec, count: row.toolCallCount })}
            </button>
          );

        case "approval-request":
          return (
            <ApprovalPanel
              approval={row.approval}
              onDecision={handleResolveApproval}
            />
          );

        case "question-request":
          return (
            <QuestionPanel
              question={row.question}
              onAnswer={handleAnswerQuestion}
            />
          );
      }
    },
    [handleToggleCollapse, handleToggleTool, handleResolveApproval, handleAnswerQuestion],
  );

  return (
    <div className="transcript-view">
      <div className="transcript-toolbar">
        <span className="overline">{intl.formatMessage({ id: "chat.transcript" })}</span>
        <span className="spacer" />
        <button className="toggle small" onClick={collapseAllFinishedTurns}>
          {intl.formatMessage({ id: "chat.collapseAll" })}
        </button>
        <button className="toggle small" onClick={expandAllTurns}>
          {intl.formatMessage({ id: "chat.expandAll" })}
        </button>
        <span className="transcript-row-count">{intl.formatMessage({ id: "chat.rowsCount" }, { count: rows.length })}</span>
      </div>

      <div
        ref={scrollRef}
        className="transcript-scroll"
        onScroll={onScroll}
      >
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const row = rows[virtualItem.index];
            if (!row) return null;
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {renderRow(row)}
              </div>
            );
          })}
        </div>
      </div>

      {showJump && (
        <button className="transcript-jump-btn" onClick={scrollToBottom}>
          <ArrowUp size={13} /> {intl.formatMessage({ id: "chat.jumpToLatest" })}
        </button>
      )}

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
