import React, { useCallback, useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import type { AccessMode, ApprovalDecision, ApprovalRequest, ChatTurn, QuestionRequest } from "./types";
import { ApprovalPanel } from "./ApprovalPanel";
import { QuestionPanel } from "./QuestionPanel";
import { Square, ArrowUp, Bookmark, BookmarkCheck } from "lucide-react";

interface ChatComposerProps {
  turns: ChatTurn[];
  activeTurnId: string | null;
  onSendPrompt: (text: string) => void;
  onInterrupt: (turnId: string) => void;
  onResolveApproval: (approvalId: string, decision: ApprovalDecision) => void;
  onAnswerQuestion: (questionId: string, answer: string) => void;
  accessMode: AccessMode;
  onAccessModeChange: (mode: AccessMode) => void;
  drafts: Record<string, string>;
  onDraftChange: (turnId: string | null, text: string) => void;
  isReachable?: boolean;
  /** Whether this session is ephemeral (scratch) — shows the "won't be kept" marker. */
  isEphemeral?: boolean;
  /** Callback to persist (save) an ephemeral session. */
  onPersistSession?: () => void;
  /** Callback to un-persist a session (make it ephemeral again). Shows a confirm dialog. */
  onUnpersistSession?: () => void;
}

export function ChatComposer({
  turns,
  activeTurnId,
  onSendPrompt,
  onInterrupt,
  onResolveApproval,
  onAnswerQuestion,
  accessMode,
  onAccessModeChange,
  drafts,
  onDraftChange,
  isReachable = true,
  isEphemeral = false,
  onPersistSession,
  onUnpersistSession,
}: ChatComposerProps) {
  const intl = useIntl();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localDraft, setLocalDraft] = useState("");

  const activeTurn = activeTurnId
    ? turns.find((t) => t.id === activeTurnId)
    : null;
  const isRunning = activeTurn && !activeTurn.finished;
  const pendingApproval = activeTurn?.approval && !activeTurn.approval.resolved
    ? activeTurn.approval
    : null;
  const pendingQuestion = activeTurn?.question && !activeTurn.question.resolved
    ? activeTurn.question
    : null;

  const draftKey = activeTurnId ?? "__new";
  const currentDraft = localDraft !== undefined ? localDraft : (drafts[draftKey] ?? "");

  useEffect(() => {
    setLocalDraft(drafts[draftKey] ?? "");
  }, [draftKey, drafts]);

  useEffect(() => {
    if (textareaRef.current && !isRunning && !pendingApproval && !pendingQuestion && isReachable) {
      textareaRef.current.focus();
    }
  }, [isRunning, pendingApproval, pendingQuestion, isReachable]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [localDraft]);

  const handleSend = useCallback(() => {
    const text = currentDraft.trim();
    if (!text) return;
    onSendPrompt(text);
    setLocalDraft("");
    onDraftChange(activeTurnId, "");
  }, [currentDraft, onSendPrompt, onDraftChange, activeTurnId]);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setLocalDraft(val);
      onDraftChange(activeTurnId, val);
    },
    [onDraftChange, activeTurnId],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="chat-composer">
      {pendingApproval && (
        <ApprovalPanel
          approval={pendingApproval}
          onDecision={onResolveApproval}
        />
      )}

      {pendingQuestion && (
        <QuestionPanel
          question={pendingQuestion}
          onAnswer={onAnswerQuestion}
        />
      )}

      <div className="composer-input-area">
        {isEphemeral ? (
          <div className="composer-ephemeral-row">
            <span className="composer-ephemeral-marker">
              {intl.formatMessage({ id: "session.ephemeralMarker" })}
            </span>
            <button
              className="composer-persist-btn"
              title={intl.formatMessage({ id: "session.persistAction" })}
              onClick={onPersistSession}
            >
              <Bookmark size={11} />
              {intl.formatMessage({ id: "session.persistAction" })}
            </button>
          </div>
        ) : (
          <div className="composer-ephemeral-row">
            <button
              className="composer-persist-btn composer-persist-btn-active"
              title={intl.formatMessage({ id: "session.unpersistAction" })}
              onClick={onUnpersistSession}
            >
              <BookmarkCheck size={11} />
              {intl.formatMessage({ id: "session.persistedMarker" })}
            </button>
          </div>
        )}
        <div className="composer-row">
          <div className="composer-access-mode">
            <button
              className={`mode-chip ${accessMode === "supervised" ? "active" : ""}`}
              onClick={() => onAccessModeChange("supervised")}
              title={intl.formatMessage({ id: "chat.supervisedTitle" })}
            >
              {intl.formatMessage({ id: "chat.supervised" })}
            </button>
            <button
              className={`mode-chip ${accessMode === "full" ? "active" : ""}`}
              onClick={() => onAccessModeChange("full")}
              title={intl.formatMessage({ id: "chat.fullAccessTitle" })}
            >
              {intl.formatMessage({ id: "chat.fullAccess" })}
            </button>
          </div>
        </div>

        <div className="composer-text-row">
          <textarea
            ref={textareaRef}
            className="composer-textarea"
            placeholder={isReachable
              ? intl.formatMessage({ id: "chat.sendPlaceholder" })
              : intl.formatMessage({ id: "chat.sendPlaceholderUnreachable" })}
            value={currentDraft}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            disabled={!!isRunning || !isReachable}
            rows={1}
          />
          {isRunning ? (
            <button
              className="composer-stop-btn"
              title={intl.formatMessage({ id: "chat.stopTurn" })}
              onClick={() => activeTurnId && onInterrupt(activeTurnId)}
            >
              <Square size={12} />
            </button>
          ) : (
            <button
              className="composer-send-btn"
              title={intl.formatMessage({ id: "chat.sendPrompt" })}
              onClick={handleSend}
              disabled={!currentDraft.trim() || !isReachable}
            >
              <ArrowUp size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
