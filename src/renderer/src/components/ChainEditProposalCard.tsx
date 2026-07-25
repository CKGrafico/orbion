import React, { useCallback } from "react";
import { useIntl } from "react-intl";
import type { ChainEditProposalRow, ChainEditProposalStatus } from "../chat/types";
import type { Environment } from "../types";
import { TaskChainView } from "./TaskChainView";

interface ChainEditProposalCardProps {
  row: ChainEditProposalRow;
  instance?: Environment;
  onApproved: (proposalId: string, loopId: string, environmentId: string) => void;
  onRejected: (proposalId: string) => void;
  onStatusChange: (proposalId: string, status: ChainEditProposalStatus, error?: string) => void;
  onForkDecision?: (proposalId: string, decision: "change-all" | "fork-copy") => void;
  homeEnvironmentId?: string;
  environments?: Array<{ id: string; name: string }>;
}

export function ChainEditProposalCard({ row, instance, onApproved, onRejected, onStatusChange, onForkDecision, homeEnvironmentId, environments }: ChainEditProposalCardProps): React.ReactNode {
  const intl = useIntl();

  const isPending = row.status === "pending";
  const isApplying = row.status === "applying";
  const isApplied = row.status === "applied";
  const isRejected = row.status === "rejected";
  const isError = row.status === "error";
  const isTerminal = isApplied || isRejected;

  const isCrossScope = homeEnvironmentId != null && row.environmentId !== homeEnvironmentId;
  const targetEnvName = isCrossScope
    ? environments?.find((e) => e.id === row.environmentId)?.name ?? row.environmentId
    : undefined;

  const warning = row.sharedTaskWarning;
  const hasWarning = warning != null && warning.referencingLoops.length > 0;
  const needsDecision = hasWarning && warning.decision === null;
  const hasDecision = hasWarning && warning.decision !== null;

  const handleApprove = useCallback((): void => {
    if (!instance) return;

    onStatusChange(row.proposalId, "applying");

    onApproved(row.proposalId, row.loopId, row.environmentId);
  }, [instance, row, onApproved, onStatusChange]);

  const handleReject = useCallback((): void => {
    onRejected(row.proposalId);
  }, [onRejected, row.proposalId]);

  const handleChangeAll = useCallback((): void => {
    onForkDecision?.(row.proposalId, "change-all");
  }, [onForkDecision, row.proposalId]);

  const handleForkCopy = useCallback((): void => {
    onForkDecision?.(row.proposalId, "fork-copy");
  }, [onForkDecision, row.proposalId]);

  const approveLabel = (() => {
    if (isApplying) return intl.formatMessage({ id: "chainEditProposal.applying" });
    if (warning?.decision === "fork-copy") return intl.formatMessage({ id: "chainEditProposal.approveFork" });
    if (warning?.decision === "change-all") return intl.formatMessage({ id: "chainEditProposal.approveChangeAll" });
    return intl.formatMessage({ id: "chainEditProposal.approve" });
  })();

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

      {/* Cross-scope banner */}
      {isCrossScope && targetEnvName && (
        <div className="chain-edit-proposal-cross-scope-banner">
          {intl.formatMessage({ id: "chainEditProposal.crossScopeBanner" }, { instance: targetEnvName })}
        </div>
      )}

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

      {/* Shared-task warning */}
      {hasWarning && (
        <div className={`chain-edit-proposal-warning${needsDecision ? " chain-edit-proposal-warning--needs-decision" : ""}`}>
          <div className="chain-edit-proposal-warning-header">
            <span className="chain-edit-proposal-warning-icon">⚠</span>
            <span className="chain-edit-proposal-warning-title">
              {intl.formatMessage({ id: "chainEditProposal.sharedTaskWarning.title" })}
            </span>
          </div>
          <div className="chain-edit-proposal-warning-body">
            {intl.formatMessage(
              { id: "chainEditProposal.sharedTaskWarning.description" },
              { count: warning.referencingLoops.length },
            )}
            <ul className="chain-edit-proposal-warning-loops">
              {warning.referencingLoops.map((loop) => (
                <li key={loop.loopId} className="chain-edit-proposal-warning-loop-item">
                  {loop.loopName}
                </li>
              ))}
            </ul>
          </div>

          {/* Fork strategy choice — shown when decision is pending */}
          {needsDecision && isPending && (
            <div className="chain-edit-proposal-warning-actions">
              <button
                className="chain-edit-proposal-btn chain-edit-proposal-btn--change-all"
                onClick={handleChangeAll}
                type="button"
              >
                {intl.formatMessage({ id: "chainEditProposal.sharedTaskWarning.changeAll" })}
              </button>
              <button
                className="chain-edit-proposal-btn chain-edit-proposal-btn--fork-copy"
                onClick={handleForkCopy}
                type="button"
              >
                {intl.formatMessage({ id: "chainEditProposal.sharedTaskWarning.forkCopy" })}
              </button>
            </div>
          )}

          {/* Decision badge — shown after the user has chosen */}
          {hasDecision && (
            <div className={`chain-edit-proposal-warning-decision${warning.decision === "fork-copy" ? " chain-edit-proposal-warning-decision--fork" : " chain-edit-proposal-warning-decision--change-all"}`}>
              {warning.decision === "fork-copy"
                ? intl.formatMessage({ id: "chainEditProposal.sharedTaskWarning.forkCopyBadge" })
                : intl.formatMessage({ id: "chainEditProposal.sharedTaskWarning.changeAllBadge" })}
            </div>
          )}
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

      {/* Action buttons — hidden when warning needs a decision first */}
      {isPending && !needsDecision && (
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
            {approveLabel}
          </button>
        </div>
      )}
    </div>
  );
}
