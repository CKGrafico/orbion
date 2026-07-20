import React, { useCallback } from "react";
import { useIntl } from "react-intl";
import type { SiblingOfferRow } from "../chat/types";
import type { SiblingOfferStatus } from "../../../shared/sibling-offer-types";
import type { Environment } from "../types";

interface SiblingOfferCardProps {
  row: SiblingOfferRow;
  /** The environment instance for the source loop (for context). */
  instance?: Environment;
  /** Callback when the offer is approved. */
  onApproved: (offerId: string, siblingLoopId: string, siblingEnvironmentId: string) => void;
  /** Callback when the offer is declined. */
  onDeclined: (offerId: string, siblingLoopId: string, siblingEnvironmentId: string, fingerprint: string) => void;
  /** Callback when the offer status changes (e.g., applying, error). */
  onStatusChange: (offerId: string, status: SiblingOfferStatus, error?: string) => void;
  /** The session's home environment ID, for cross-scope detection. */
  homeEnvironmentId?: string;
}

/**
 * A card that presents a structural chain-change offer for a sibling loop.
 *
 * After a structural chain edit is applied to one loop, this card appears
 * for each sibling loop on other instances that shares the same structural
 * shape. The user can approve or decline each offer independently.
 *
 * Each card shows:
 * - The sibling loop's name and instance
 * - A summary of the structural change
 * - Approve / Decline buttons
 *
 * On approval, the parent (SessionChatView) calls the MCP service to
 * apply the structural diff on the sibling instance. On decline, the
 * decline is persisted so the offer is not shown again.
 */
export function SiblingOfferCard({ row, instance, onApproved, onDeclined, onStatusChange, homeEnvironmentId }: SiblingOfferCardProps): React.ReactNode {
  const intl = useIntl();

  const isPending = row.status === "pending";
  const isApplying = row.status === "applying";
  const isApplied = row.status === "applied";
  const isDeclined = row.status === "declined";
  const isError = row.status === "error";
  const isTerminal = isApplied || isDeclined;

  // Cross-scope detection: sibling offer targets a non-home instance
  const isCrossScope = homeEnvironmentId != null && row.siblingEnvironmentId !== homeEnvironmentId;

  const handleApprove = useCallback((): void => {
    onStatusChange(row.offerId, "applying");
    onApproved(row.offerId, row.siblingLoopId, row.siblingEnvironmentId);
  }, [row, onApproved, onStatusChange]);

  const handleDecline = useCallback((): void => {
    onDeclined(row.offerId, row.siblingLoopId, row.siblingEnvironmentId, row.structuralDiff.fingerprint);
  }, [row, onDeclined]);

  return (
    <div className={`sibling-offer-card${isTerminal ? " sibling-offer-card--terminal" : ""}${isError ? " sibling-offer-card--error" : ""}`}>
      {/* Header */}
      <div className="sibling-offer-header">
        <span className="sibling-offer-icon">⇄</span>
        <span className="sibling-offer-title">
          {intl.formatMessage({ id: "siblingOffer.title" })}
        </span>
        {isApplied && (
          <span className="sibling-offer-status sibling-offer-status--applied">
            {intl.formatMessage({ id: "siblingOffer.statusApplied" })}
          </span>
        )}
        {isDeclined && (
          <span className="sibling-offer-status sibling-offer-status--declined">
            {intl.formatMessage({ id: "siblingOffer.statusDeclined" })}
          </span>
        )}
      </div>

      {/* Instance attribution */}
      <div className={`sibling-offer-attribution${isCrossScope ? " sibling-offer-attribution--cross-scope" : ""}`}>
        {isCrossScope
          ? intl.formatMessage(
              { id: "siblingOffer.crossScopeAttribution" },
              { loopName: row.siblingLoopDescription, instance: row.siblingEnvironmentName },
            )
          : intl.formatMessage(
              { id: "siblingOffer.attribution" },
              { loopName: row.siblingLoopDescription, instance: row.siblingEnvironmentName },
            )
        }
      </div>

      {/* Structural change summary */}
      {row.structuralDiff.operations.length > 0 && (
        <div className="sibling-offer-operations">
          {row.structuralDiff.operations.map((op, idx) => (
            <div key={idx} className={`sibling-offer-op sibling-offer-op--${op.kind}`}>
              <span className="sibling-offer-op-icon">
                {op.kind === "add-step" || op.kind === "add-branch" ? "+" : op.kind === "remove-step" || op.kind === "remove-branch" ? "−" : "±"}
              </span>
              <span className="sibling-offer-op-text">{op.description}</span>
            </div>
          ))}
        </div>
      )}

      {/* Error message */}
      {isError && row.error && (
        <div className="sibling-offer-error">{row.error}</div>
      )}

      {/* Action buttons */}
      {isPending && (
        <div className="sibling-offer-actions">
          <button
            className="sibling-offer-btn sibling-offer-btn--decline"
            onClick={handleDecline}
            disabled={isApplying}
            type="button"
          >
            {intl.formatMessage({ id: "siblingOffer.decline" })}
          </button>
          <button
            className="sibling-offer-btn sibling-offer-btn--approve"
            onClick={handleApprove}
            disabled={isApplying}
            type="button"
          >
            {isApplying
              ? intl.formatMessage({ id: "siblingOffer.applying" })
              : intl.formatMessage({ id: "siblingOffer.approve" })}
          </button>
        </div>
      )}
    </div>
  );
}
