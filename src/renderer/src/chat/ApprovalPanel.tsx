import React, { useCallback } from "react";
import { useIntl } from "react-intl";
import type { ApprovalRequest, ApprovalDecision } from "./types";

interface ApprovalPanelProps {
  approval: ApprovalRequest;
  onDecision: (approvalId: string, decision: ApprovalDecision) => void;
}

const DECISION_CONFIG: Array<{ value: ApprovalDecision; labelKey: string; className: string }> = [
  { value: "approve-once", labelKey: "chat.approveOnce", className: "approval-btn approve" },
  { value: "approve-always", labelKey: "chat.alwaysAllow", className: "approval-btn always" },
  { value: "decline", labelKey: "chat.decline", className: "approval-btn decline" },
  { value: "cancel", labelKey: "chat.cancelTurn", className: "approval-btn cancel" },
];

export function ApprovalPanel({ approval, onDecision }: ApprovalPanelProps) {
  const intl = useIntl();
  const handleDecision = useCallback(
    (decision: ApprovalDecision) => {
      onDecision(approval.id, decision);
    },
    [approval.id, onDecision],
  );

  return (
    <div className="approval-panel">
      <div className="approval-header">
        <span className="approval-icon">⚠</span>
        <span className="approval-title">{intl.formatMessage({ id: "chat.approvalRequired" })}</span>
      </div>
      <div className="approval-body">
        <span className="approval-description">{approval.description}</span>
        {approval.command && (
          <code className="approval-detail mono">{approval.command}</code>
        )}
        {approval.filePath && (
          <code className="approval-detail mono">{approval.filePath}</code>
        )}
      </div>
      <div className="approval-actions">
        {DECISION_CONFIG.map((cfg) => (
          <button
            key={cfg.value}
            className={cfg.className}
            onClick={() => handleDecision(cfg.value)}
          >
            {intl.formatMessage({ id: cfg.labelKey })}
          </button>
        ))}
      </div>
    </div>
  );
}
