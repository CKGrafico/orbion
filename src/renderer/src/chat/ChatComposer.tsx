import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AccessMode, ApprovalDecision, ChatTurn } from "./types";
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
  const { t } = useTranslation();
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
  const currentDraft = localDraft;

  // Only reset localDraft when the draftKey changes (switching turns/sessions),
  // NOT when drafts changes (that would wipe what the user is typing on every keystroke).
  useEffect(() => {
    setLocalDraft(drafts[draftKey] ?? "");
  }, [draftKey]);

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
              {t("session.ephemeralMarker")}
            </span>
            <button
              className="composer-persist-btn"
              title={t("session.persistAction")}
              onClick={onPersistSession}
            >
              <Bookmark size={11} />
              {t("session.persistAction")}
            </button>
          </div>
        ) : (
          <div className="composer-ephemeral-row">
            <button
              className="composer-persist-btn composer-persist-btn-active"
              title={t("session.unpersistAction")}
              onClick={onUnpersistSession}
            >
              <BookmarkCheck size={11} />
              {t("session.persistedMarker")}
            </button>
          </div>
        )}
        <div className="composer-row">
          <div className="composer-access-mode">
            <button
              className={`mode-chip ${accessMode === "supervised" ? "active" : ""}`}
              onClick={() => onAccessModeChange("supervised")}
              title={t("chat.supervisedTitle")}
            >
              {t("chat.supervised")}
            </button>
            <button
              className={`mode-chip ${accessMode === "full" ? "active" : ""}`}
              onClick={() => onAccessModeChange("full")}
              title={t("chat.fullAccessTitle")}
            >
              {t("chat.fullAccess")}
            </button>
          </div>
        </div>

        <div className="composer-text-row">
          <textarea
            ref={textareaRef}
            className="composer-textarea"
            placeholder={isReachable
              ? t("chat.sendPlaceholder")
              : t("chat.sendPlaceholderUnreachable")}
            value={currentDraft}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            disabled={!!isRunning || !isReachable}
            rows={1}
          />
          {isRunning ? (
            <button
              className="composer-stop-btn"
              title={t("chat.stopTurn")}
              onClick={() => activeTurnId && onInterrupt(activeTurnId)}
            >
              <Square size={12} />
            </button>
          ) : (
            <button
              className="composer-send-btn"
              title={t("chat.sendPrompt")}
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
