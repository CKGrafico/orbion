import { useTranslation } from "react-i18next";
import type { BudgetBreach } from "../../../shared/ipc";
import { AlertTriangle, Play, X } from "lucide-react";

interface BreachInboxProps {
  breaches: BudgetBreach[];
  onDismiss: (breachId: string) => void;
  onResume: (environmentId: string, loopId: string) => void;
  onClickBreach?: (breach: BudgetBreach) => void;
}

export function BreachInbox(props: BreachInboxProps): React.ReactNode {
  const { breaches, onDismiss, onResume, onClickBreach } = props;
  const { t } = useTranslation();

  const activeBreaches = breaches.filter((b) => !b.dismissed);

  if (activeBreaches.length === 0) return null;

  return (
    <div className="breach-inbox">
      <div className="breach-inbox-header">
        <AlertTriangle size={12} />
        <span className="overline">{t("budget.breachTitle")}</span>
        <span className="chip breach-count">{activeBreaches.length}</span>
      </div>
      <div className="breach-inbox-list">
        {activeBreaches.map((breach) => (
          <div
            key={breach.id}
            className="breach-inbox-row"
            onClick={() => onClickBreach?.(breach)}
            role={onClickBreach ? "button" : undefined}
            tabIndex={onClickBreach ? 0 : undefined}
          >
            <span className="breach-inbox-dot" />
            <div className="breach-inbox-info">
              <span className="breach-inbox-name">{breach.loopDescription}</span>
              <span className="breach-inbox-meta">
                {breach.runsToday}/{breach.threshold}
                {breach.autoPaused ? " · paused" : ""}
              </span>
            </div>
            {breach.autoPaused ? (
              <button
                className="icon-btn breach-inbox-resume"
                title={t("budget.resumeLoop")}
                onClick={(e) => {
                  e.stopPropagation();
                  onResume(breach.environmentId, breach.loopId);
                }}
              >
                <Play size={11} />
              </button>
            ) : null}
            <button
              className="icon-btn breach-inbox-dismiss"
              title={t("budget.dismissBreach")}
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(breach.id);
              }}
            >
              <X size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
