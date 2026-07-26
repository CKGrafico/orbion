import React from "react";
import { useTranslation } from "react-i18next";
import type { FailureDiagnosisRow } from "../chat/types";
import { categoryLabelKey, isEnvironmentDownCategory } from "../chat/diagnoseFailure";

interface FailureDiagnosisPanelProps {
  row: FailureDiagnosisRow;
}

export function FailureDiagnosisPanel({ row }: FailureDiagnosisPanelProps): React.ReactNode {
  const { t } = useTranslation();

  const isEnvDown = isEnvironmentDownCategory(row.category);
  const panelCls = `failure-diagnosis-panel${isEnvDown ? " failure-diagnosis-panel--env-down" : ""}`;

  const categoryLabel = t(categoryLabelKey(row.category));
  const summaryText = t(row.summary, row.params);
  const nextStepText = t(row.nextStep, row.params);

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
          {t("diagnosis.title")}
        </span>
        <span className={`failure-diagnosis-category${isEnvDown ? " failure-diagnosis-category--env" : ""}`}>
          {categoryLabel}
        </span>
      </div>
      <div className="failure-diagnosis-body">
        <p className="failure-diagnosis-summary">{summaryText}</p>
        <div className="failure-diagnosis-next-step">
          <span className="failure-diagnosis-next-step-label">
            {t("diagnosis.nextStepLabel")}
          </span>
          <span className="failure-diagnosis-next-step-text">{nextStepText}</span>
        </div>
      </div>
      <div className="failure-diagnosis-footer">
        <span className="failure-diagnosis-confidence">
          {t("diagnosis.confidenceLabel")} {confidenceLabel}
        </span>
      </div>
    </div>
  );
}
