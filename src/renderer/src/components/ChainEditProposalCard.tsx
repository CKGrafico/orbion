import React, { useCallback } from "react";
import { useIntl } from "react-intl";
import type { ChainEditProposalRow, ChainEditProposalStatus } from "../chat/types";
import type { Environment } from "../types";
import { TaskChainView } from "./TaskChainView";

interface ChainEditProposalCardProps {
  row: ChainEditProposalRow;
  /** The environment instance to apply chain edits on. */
  instance?: Environment;
  /** Callback when the proposal is approved. The parent is responsible for
   *  calling the MCP service to apply the edit, then calling onStatusChange
   *  with "applied" or "error". */
  onApproved: (proposalId: string, loopId: string, environmentId: string) => void;
  /** Callback when the proposal is rejected. */
  onRejected: (proposalId: string) => void;
  /** Callback when the proposal status changes (e.g., applying, error). */
  onStatusChange: (proposalId: string, status: ChainEditProposalStatus, error?: string) => void;
}

/**
 * A proposal card for chat-driven chain edits.
 *
 * When the agent (via MCP tools) proposes modifying a loop's task chain,
 * this card appears in the chat stream showing:
 * - A preview of the proposed chain (via TaskChainView)
 * - A summary of operations (e.g., "Add step: Run tests after Build")
 * - Approve / Reject buttons
 *
 * On approval, the parent (SessionChatView) calls the MCP service to
 * apply the chain edit. On rejection, the proposal is marked as rejected.
 * No form-based editing is provided — the chat is the editor.
 */
export function ChainEditProposalCard({ row, instance, onApproved, onRejected, onStatusChange }: ChainEditProposalCardProps): React.ReactNode {
  const intl = useIntl();

  const isPending = row.status === "pending";
  const isApplying = row.status === "applying";
  const isApplied = row.status === "applied";
  const isRejected = row.status === "rejected";
  const isError = row.status === "error";
  const isTerminal = isApplied || isRejected;

  const handleApprove = useCallback((): void => {
    if (!instance) return;

    onStatusChange(row.proposalId, "applying");

    // The actual MCP tool calls to apply the chain edit are delegated
    // to the parent component (SessionChatView) which has access to the
    // MCP service. Signal approval so the parent can apply.
    onApproved(row.proposalId, row.loopId, row.environmentId);
  }, [instance, row, onApproved, onStatusChange]);

  const handleReject = useCallback((): void => {
    onRejected(row.proposalId);
  }, [onRejected, row.proposalId]);

  return (
    <div className={`chain-edit-proposal-card${isTerminal ? " chain-edit-proposal-card--terminal" : ""}${isError ? " chain-edit-proposal-card--error" : ""}`}>
      {/* Header */}
      <div className="chain-edit-proposal-header">
        <span className="chain-edit-proposal-icon">≔</span>
        <span className="chain-edit-proposal-title">{intl.formatMessage({ id: "chainEditProposal.title" })}</span>
        {isApplied && (
          <span className="chain-edit-proposal-status chain-edit-proposal-status--applied">
            {intl.formatMessage({ id: "chainEditProposal.statusApplied" })}
          </span>
        )}
        {isRejected && (
          <span className="chain-edit-proposal-status chain-edit-proposal-status--rejected">
            {intl.formatMessage({ id: "chainEditProposal.statusRejected" })}
          </span>
        )}
      </div>

      {/* Operation summaries */}
      {row.operationSummaries.length > 0 && (
        <div className="chain-edit-proposal-operations">
          {row.operationSummaries.map((op, idx) => (
            <div key={idx} className={`chain-edit-proposal-op chain-edit-proposal-op--${op.kind}`}>
              <span className="chain-edit-proposal-op-icon">
                {op.kind === "create-task" ? "+" : op.kind === "update-task" ? "±" : "−"}
              </span>
              <span className="chain-edit-proposal-op-text">{op.description}</span>
            </div>
          ))}
        </div>
      )}

      {/* Proposed chain preview */}
      {row.proposedSteps.length > 0 && (
        <div className="chain-edit-proposal-chain-preview">
          <div className="chain-edit-proposal-chain-label">
            {intl.formatMessage({ id: "chainEditProposal.previewLabel" })}
          </div>
          <TaskChainView steps={row.proposedSteps} />
        </div>
      )}

      {/* Error message */}
      {isError && row.error && (
        <div className="chain-edit-proposal-error">{row.error}</div>
      )}

      {/* Action buttons */}
      {isPending && (
        <div className="chain-edit-proposal-actions">
          <button
            className="chain-edit-proposal-btn chain-edit-proposal-btn--reject"
            onClick={handleReject}
            disabled={isApplying}
          >
            {intl.formatMessage({ id: "chainEditProposal.reject" })}
          </button>
          <button
            className="chain-edit-proposal-btn chain-edit-proposal-btn--approve"
            onClick={handleApprove}
            disabled={isApplying}
          >
            {isApplying
              ? intl.formatMessage({ id: "chainEditProposal.applying" })
              : intl.formatMessage({ id: "chainEditProposal.approve" })}
          </button>
        </div>
      )}
    </div>
  );
}
