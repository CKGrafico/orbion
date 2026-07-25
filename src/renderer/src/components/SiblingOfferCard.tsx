import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { SiblingOfferRow } from "../chat/types";
import type { SiblingOfferStatus } from "../../../shared/sibling-offer-types";
import type { Environment } from "../types";

interface SiblingOfferCardProps {
  row: SiblingOfferRow;
  instance?: Environment;
  onApproved: (offerId: string, siblingLoopId: string, siblingEnvironmentId: string) => void;
  onDeclined: (offerId: string, siblingLoopId: string, siblingEnvironmentId: string, fingerprint: string) => void;
  onStatusChange: (offerId: string, status: SiblingOfferStatus, error?: string) => void;
  homeEnvironmentId?: string;
}

export function SiblingOfferCard({ row, instance, onApproved, onDeclined, onStatusChange, homeEnvironmentId }: SiblingOfferCardProps): React.ReactNode {
  const { t } = useTranslation();

  const isPending = row.status === "pending";
  const isApplying = row.status === "applying";
  const isApplied = row.status === "applied";
  const isDeclined = row.status === "declined";
  const isError = row.status === "error";
  const isTerminal = isApplied || isDeclined;

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
      <div className="sibling-offer-header">
        <span className="sibling-offer-icon">⇄</span>
        <span className="sibling-offer-title">
          {t("siblingOffer.title")}
        </span>
        {isApplied && (
          <span className="sibling-offer-status sibling-offer-status--applied">
            {t("siblingOffer.statusApplied")}
          </span>
        )}
        {isDeclined && (
          <span className="sibling-offer-status sibling-offer-status--declined">
            {t("siblingOffer.statusDeclined")}
          </span>
        )}
      </div>

      <div className={`sibling-offer-attribution${isCrossScope ? " sibling-offer-attribution--cross-scope" : ""}`}>
        {isCrossScope
          ? t("siblingOffer.crossScopeAttribution", { loopName: row.siblingLoopDescription, instance: row.siblingEnvironmentName })
          : t("siblingOffer.attribution", { loopName: row.siblingLoopDescription, instance: row.siblingEnvironmentName })
        }
      </div>

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

      {isError && row.error && (
        <div className="sibling-offer-error">{row.error}</div>
      )}

      {isPending && (
        <div className="sibling-offer-actions">
          <button
            className="sibling-offer-btn sibling-offer-btn--decline"
            onClick={handleDecline}
            disabled={isApplying}
            type="button"
          >
            {t("siblingOffer.decline")}
          </button>
          <button
            className="sibling-offer-btn sibling-offer-btn--approve"
            onClick={handleApprove}
            disabled={isApplying}
            type="button"
          >
            {isApplying
              ? t("siblingOffer.applying")
              : t("siblingOffer.approve")}
          </button>
        </div>
      )}
    </div>
  );
}
