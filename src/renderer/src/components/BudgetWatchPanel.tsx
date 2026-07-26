import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { BudgetWatch, BudgetBreach } from "../../../shared/ipc";
import type { Environment, LoopMeta } from "../types";
import { Clock, Play, Trash2, Plus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

interface BudgetWatchPanelProps {
  open?: boolean;
  watches: BudgetWatch[];
  breaches: BudgetBreach[];
  environments: Environment[];
  perEnvLoops: Record<string, LoopMeta[]>;
  onAddWatch: (watch: Omit<BudgetWatch, "id" | "createdAt">) => void;
  onRemoveWatch: (watchId: string) => void;
  onToggleWatch: (watchId: string, enabled: boolean) => void;
  onDismissBreach: (breachId: string) => void;
  onResumeLoop: (environmentId: string, loopId: string) => void;
  onClose: () => void;
}

export function BudgetWatchPanel(props: BudgetWatchPanelProps): React.ReactNode {
  const {
    watches,
    breaches,
    environments,
    perEnvLoops,
    onAddWatch,
    onRemoveWatch,
    onToggleWatch,
    onDismissBreach,
    onResumeLoop,
    onClose,
  } = props;
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);

  const activeBreaches = breaches.filter((b) => !b.dismissed);

  return (
    <Sheet open={props.open ?? true} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>
            <Clock size={14} className="inline mr-2" />
            {t("budget.title")}
          </SheetTitle>
          <SheetDescription>{t("budget.title")}</SheetDescription>
        </SheetHeader>

        <p className="budget-panel-description">
          {t("budget.description")}
        </p>

        {/* Breach inbox */}
        {activeBreaches.length > 0 ? (
          <div className="budget-section">
            <div className="budget-section-header">
              <span className="overline">{t("budget.breachTitle")}</span>
            </div>
            <div className="budget-breach-list">
              {activeBreaches.map((breach) => (
                <div key={breach.id} className="budget-breach-row">
                  <span className="budget-breach-dot" />
                  <div className="budget-breach-info">
                    <span className="budget-breach-name">{breach.loopDescription}</span>
                    <span className="budget-breach-meta">
                      {breach.runsToday}/{breach.threshold} runs
                      {breach.autoPaused ? " · auto-paused" : ""}
                    </span>
                  </div>
                  {breach.autoPaused ? (
                    <button
                      className="btn budget-breach-action"
                      title={t("budget.resumeLoop")}
                      onClick={() => onResumeLoop(breach.environmentId, breach.loopId)}
                    >
                      <Play size={12} />
                    </button>
                  ) : null}
                  <button
                    className="icon-btn budget-breach-dismiss"
                    title={t("budget.dismissBreach")}
                    onClick={() => onDismissBreach(breach.id)}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Watches list */}
        <div className="budget-section">
          <div className="budget-section-header">
            <span className="overline">{t("budget.title")}</span>
            <span className="spacer" />
            <button
              className="btn budget-add-btn"
              onClick={() => setShowForm((v) => !v)}
            >
              <Plus size={12} />
              {t("budget.addWatch")}
            </button>
          </div>

          {watches.length === 0 ? (
            <div className="budget-empty">
              <p>{t("budget.noWatchesDescription")}</p>
            </div>
          ) : (
            <div className="budget-watch-list">
              {watches.map((watch) => {
                const env = environments.find((e) => e.id === watch.environmentId);
                const envLoops = watch.environmentId ? (perEnvLoops[watch.environmentId] ?? []) : [];
                const loop = watch.loopId ? envLoops.find((l) => l.id === watch.loopId) : null;
                const scopeLabel = watch.scope === "fleet"
                  ? t("budget.fleetLabel")
                  : (loop?.description?.trim() || watch.loopId || "");

                return (
                  <div key={watch.id} className={`budget-watch-row${!watch.enabled ? " disabled" : ""}`}>
                    <button
                      className="budget-watch-toggle"
                      title={watch.enabled ? t("budget.enabled") : t("budget.disabled")}
                      onClick={() => onToggleWatch(watch.id, !watch.enabled)}
                    >
                      <span className={`budget-toggle-dot${watch.enabled ? " on" : ""}`} />
                    </button>
                    <div className="budget-watch-info">
                      <span className="budget-watch-scope">{scopeLabel}</span>
                      <span className="budget-watch-meta">
                        {watch.scope === "loop" && env ? `${env.name} · ` : ""}
                        ≤{watch.threshold}/day
                        {watch.autoPause ? " · auto-pause" : ""}
                      </span>
                    </div>
                    <button
                      className="icon-btn"
                      title={t("budget.removeWatch")}
                      onClick={() => onRemoveWatch(watch.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add watch form */}
        {showForm ? (
          <AddWatchForm
            environments={environments}
            perEnvLoops={perEnvLoops}
            onAdd={onAddWatch}
            onCancel={() => setShowForm(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function AddWatchForm(props: {
  environments: Environment[];
  perEnvLoops: Record<string, LoopMeta[]>;
  onAdd: (watch: Omit<BudgetWatch, "id" | "createdAt">) => void;
  onCancel: () => void;
}): React.ReactNode {
  const { environments, perEnvLoops, onAdd, onCancel } = props;
  const { t } = useTranslation();

  const [scope, setScope] = useState<"loop" | "fleet">("loop");
  const [environmentId, setEnvironmentId] = useState<string>(environments[0]?.id ?? "");
  const [loopId, setLoopId] = useState<string>("");
  const [threshold, setThreshold] = useState<string>("100");
  const [autoPause, setAutoPause] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const envLoops = environmentId ? (perEnvLoops[environmentId] ?? []) : [];

  const handleSubmit = (): void => {
    setError(null);

    const thresholdNum = parseInt(threshold, 10);
    if (isNaN(thresholdNum) || thresholdNum <= 0) {
      setError(t("budget.invalidThreshold"));
      return;
    }

    if (scope === "loop") {
      if (!loopId) {
        setError(t("budget.loopRequired"));
        return;
      }
      if (!environmentId) {
        setError(t("budget.environmentRequired"));
        return;
      }
    }

    onAdd({
      scope,
      loopId: scope === "loop" ? loopId : undefined,
      environmentId: scope === "loop" ? environmentId : undefined,
      threshold: thresholdNum,
      autoPause,
      enabled: true,
    });
    onCancel();
  };

  return (
    <div className="budget-form">
      <div className="budget-form-row">
        <label className="budget-form-label">{t("budget.scopeLabel")}</label>
        <div className="budget-form-scope-toggle">
          <button
            className={`budget-form-scope-btn${scope === "loop" ? " active" : ""}`}
            onClick={() => setScope("loop")}
          >
            {t("budget.scopeLoop")}
          </button>
          <button
            className={`budget-form-scope-btn${scope === "fleet" ? " active" : ""}`}
            onClick={() => setScope("fleet")}
          >
            {t("budget.scopeFleet")}
          </button>
        </div>
      </div>

      {scope === "loop" ? (
        <>
          <div className="budget-form-row">
            <label className="budget-form-label">{t("budget.environmentLabel")}</label>
            <select
              className="budget-form-select"
              value={environmentId}
              onChange={(e) => { setEnvironmentId(e.target.value); setLoopId(""); }}
            >
              {environments.map((env) => (
                <option key={env.id} value={env.id}>{env.name}</option>
              ))}
            </select>
          </div>
          <div className="budget-form-row">
            <label className="budget-form-label">{t("budget.loopIdLabel")}</label>
            <select
              className="budget-form-select"
              value={loopId}
              onChange={(e) => setLoopId(e.target.value)}
            >
              <option value="">{t("budget.loopIdPlaceholder")}</option>
              {envLoops.map((loop) => (
                <option key={loop.id} value={loop.id}>
                  {loop.description?.trim() || loop.id}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}

      <div className="budget-form-row">
        <label className="budget-form-label">{t("budget.thresholdLabel")}</label>
        <input
          className="budget-form-input"
          type="number"
          min="1"
          value={threshold}
          placeholder={t("budget.thresholdPlaceholder")}
          onChange={(e) => setThreshold(e.target.value)}
        />
      </div>

      <div className="budget-form-row budget-form-checkbox-row">
        <label className="budget-form-checkbox">
          <input
            type="checkbox"
            checked={autoPause}
            onChange={(e) => setAutoPause(e.target.checked)}
          />
          <span>{t("budget.autoPauseLabel")}</span>
        </label>
        <span className="budget-form-checkbox-desc">
          {t("budget.autoPauseDescription")}
        </span>
      </div>

      {error ? <div className="budget-form-error">{error}</div> : null}

      <div className="budget-form-actions">
        <Button variant="outline" onClick={onCancel}>
          {t("vmWizard.cancel")}
        </Button>
        <Button onClick={handleSubmit}>
          {t("budget.addWatch")}
        </Button>
      </div>
    </div>
  );
}
