import React from "react";
import { useIntl } from "react-intl";
import type { FailureDiagnosisRow } from "../chat/types";
import { categoryLabelKey, isEnvironmentDownCategory } from "../chat/diagnoseFailure";

interface FailureDiagnosisPanelProps {
  row: FailureDiagnosisRow;
}

/**
 * Renders a failure diagnosis panel in the chat stream.
 * Shows the agent's interpretation of why a loop failed alongside
 * the raw exit/logs. Distinguishes "environment/target is down" from
 * "the command itself is broken" when logs support it.
 */
export function FailureDiagnosisPanel({ row }: FailureDiagnosisPanelProps): React.ReactNode {
  const intl = useIntl();

  const isEnvDown = isEnvironmentDownCategory(row.category);
  const panelCls = `failure-diagnosis-panel${isEnvDown ? " failure-diagnosis-panel--env-down" : ""}`;

  // The summary/nextStep may be i18n keys (containing dots) or plain text.
  // Try to format as i18n key first; if not found, use as-is.
  const formatText = (text: string): string => {
    // Check if it looks like an i18n key (contains dots and no spaces)
    if (text.includes(".") && !text.includes(" ")) {
      try {
        return intl.formatMessage({ id: text });
      } catch {
        return text;
      }
    }
    return text;
  };

  const categoryLabel = intl.formatMessage({ id: categoryLabelKey(row.category) });
  const summaryText = formatText(row.summary);
  const nextStepText = formatText(row.nextStep);

  const confidenceLabel = row.confidence === "high"
    ? "●●●"
    : row.confidence === "medium"
      ? "●●○"
      : "●○○";

  return (
    <div className={panelCls}>
      <div className="failure-diagnosis-header">
        <span className={`failure-diagnosis-icon${isEnvDown ? " failure-diagnosis-icon--env" : " failure-diagnosis-icon--cmd"}`}>
          {isEnvDown ? "⬇" : "⚠"}
        </span>
        <span className="failure-diagnosis-title">
          {intl.formatMessage({ id: "diagnosis.title" })}
        </span>
        <span className={`failure-diagnosis-category${isEnvDown ? " failure-diagnosis-category--env" : ""}`}>
          {categoryLabel}
        </span>
      </div>
      <div className="failure-diagnosis-body">
        <p className="failure-diagnosis-summary">{summaryText}</p>
        <div className="failure-diagnosis-next-step">
          <span className="failure-diagnosis-next-step-label">
            {intl.formatMessage({ id: "diagnosis.nextStepLabel" })}
          </span>
          <span className="failure-diagnosis-next-step-text">{nextStepText}</span>
        </div>
      </div>
      <div className="failure-diagnosis-footer">
        <span className="failure-diagnosis-confidence">
          {intl.formatMessage({ id: "diagnosis.confidenceLabel" })} {confidenceLabel}
        </span>
      </div>
    </div>
  );
}
