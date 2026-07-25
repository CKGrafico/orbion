import React from "react";
import { useTranslation } from "react-i18next";
import type { PrReferenceCardRow } from "../chat/types";
import type { PrRiskLevel } from "../../../shared/ipc";
import { GitPullRequest, ExternalLink } from "lucide-react";

/** Color class for PR risk level chip */
function riskChipClass(riskLevel: PrRiskLevel): string {
  switch (riskLevel) {
    case "low": return "pr-risk-chip pr-risk-chip-low";
    case "medium": return "pr-risk-chip pr-risk-chip-medium";
    case "high": return "pr-risk-chip pr-risk-chip-high";
    case "uncertain": return "pr-risk-chip pr-risk-chip-uncertain";
    default: return "pr-risk-chip pr-risk-chip-uncertain";
  }
}

/** Left border accent color based on risk level */
function riskBorderColor(riskLevel?: PrRiskLevel): string {
  switch (riskLevel) {
    case "low": return "var(--health-ok)";
    case "medium": return "var(--warning)";
    case "high": return "var(--danger)";
    case "uncertain":
    default: return "var(--text-muted)";
  }
}

interface PrReferenceCardProps {
  row: PrReferenceCardRow;
}

export function PrReferenceCard({ row }: PrReferenceCardProps): React.ReactNode {
  const { t } = useTranslation();

  return (
    <div
      className="pr-reference-card"
      style={{ borderLeftColor: riskBorderColor(row.prVerdict?.riskLevel) }}
    >
      <div className="pr-reference-card-header">
        <span className="pr-reference-card-icon">
          <GitPullRequest size={14} strokeWidth={1.8} />
        </span>
        <span className="pr-reference-card-number">#{row.prNumber}</span>
        <span className="pr-reference-card-title">{row.prTitle}</span>
        {row.prVerdict ? (
          <span className={riskChipClass(row.prVerdict.riskLevel)}>
            {t(`inbox.prRisk.${row.prVerdict.riskLevel}`)}
          </span>
        ) : (
          <span className="pr-risk-chip pr-risk-chip-pending">
            {t("prReferenceCard.noVerdict")}
          </span>
        )}
      </div>
      <div className="pr-reference-card-meta">
        <span className="pr-reference-card-repo">{row.prRepo}</span>
        <span className="pr-reference-card-separator">·</span>
        <span className="pr-reference-card-author">@{row.prAuthor}</span>
        {row.prVerdict ? (
          <>
            <span className="pr-reference-card-separator">·</span>
            <span className="pr-reference-card-verdict-text">{row.prVerdict.verdict}</span>
          </>
        ) : null}
      </div>
      <div className="pr-reference-card-actions">
        <button
          className="pr-reference-card-link"
          onClick={() => window.open(row.prUrl, "_blank")}
          title={t("prReferenceCard.openOnPlatform")}
        >
          <ExternalLink size={12} />
          <span>{t("prReferenceCard.openOnPlatform")}</span>
        </button>
      </div>
    </div>
  );
}
