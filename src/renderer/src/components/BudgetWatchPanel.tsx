import { useState } from "react";
import { useIntl } from "react-intl";
import type { BudgetWatch, BudgetBreach } from "../../../shared/ipc";
import type { Environment, LoopMeta } from "../types";
import { X, Clock, Play, Trash2, Plus } from "lucide-react";

interface BudgetWatchPanelProps {
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
  const intl = useIntl();
  const [showForm, setShowForm] = useState(false);

  const activeBreaches = breaches.filter((b) => !b.dismissed);

  return (
    <div className="budget-panel-backdrop" onClick={onClose}>
      <div className="budget-panel" onClick={(e) => e.stopPropagation()}>
        <div className="budget-panel-header">
          <span className="budget-panel-title">
            <Clock size={14} />
            {intl.formatMessage({ id: "budget.title" })}
          </span>
          <button className="icon-btn" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <p className="budget-panel-description">
          {intl.formatMessage({ id: "budget.description" })}
        </p>

        {/* Breach inbox */}
        {activeBreaches.length > 0 ? (
          <div className="budget-section">
            <div className="budget-section-header">
              <span className="overline">{intl.formatMessage({ id: "budget.breachTitle" })}</span>
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
                      title={intl.formatMessage({ id: "budget.resumeLoop" })}
                      onClick={() => onResumeLoop(breach.environmentId, breach.loopId)}
                    >
                      <Play size={12} />
                    </button>
                  ) : null}
                  <button
                    className="icon-btn budget-breach-dismiss"
                    title={intl.formatMessage({ id: "budget.dismissBreach" })}
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
            <span className="overline">{intl.formatMessage({ id: "budget.title" })}</span>
            <span className="spacer" />
            <button
              className="btn budget-add-btn"
              onClick={() => setShowForm((v) => !v)}
            >
              <Plus size={12} />
              {intl.formatMessage({ id: "budget.addWatch" })}
            </button>
          </div>

          {watches.length === 0 ? (
            <div className="budget-empty">
              <p>{intl.formatMessage({ id: "budget.noWatchesDescription" })}</p>
            </div>
          ) : (
            <div className="budget-watch-list">
              {watches.map((watch) => {
                const env = environments.find((e) => e.id === watch.environmentId);
                const envLoops = watch.environmentId ? (perEnvLoops[watch.environmentId] ?? []) : [];
                const loop = watch.loopId ? envLoops.find((l) => l.id === watch.loopId) : null;
                const scopeLabel = watch.scope === "fleet"
                  ? intl.formatMessage({ id: "budget.fleetLabel" })
                  : (loop?.description?.trim() || watch.loopId || "");

                return (
                  <div key={watch.id} className={`budget-watch-row${!watch.enabled ? " disabled" : ""}`}>
                    <button
                      className="budget-watch-toggle"
                      title={watch.enabled ? intl.formatMessage({ id: "budget.enabled" }) : intl.formatMessage({ id: "budget.disabled" })}
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
                      title={intl.formatMessage({ id: "budget.removeWatch" })}
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
      </div>
    </div>
  );
}

function AddWatchForm(props: {
  environments: Environment[];
  perEnvLoops: Record<string, LoopMeta[]>;
  onAdd: (watch: Omit<BudgetWatch, "id" | "createdAt">) => void;
  onCancel: () => void;
}): React.ReactNode {
  const { environments, perEnvLoops, onAdd, onCancel } = props;
  const intl = useIntl();

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
      setError(intl.formatMessage({ id: "budget.invalidThreshold" }));
      return;
    }

    if (scope === "loop") {
      if (!loopId) {
        setError(intl.formatMessage({ id: "budget.loopRequired" }));
        return;
      }
      if (!environmentId) {
        setError(intl.formatMessage({ id: "budget.environmentRequired" }));
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
        <label className="budget-form-label">{intl.formatMessage({ id: "budget.scopeLabel" })}</label>
        <div className="budget-form-scope-toggle">
          <button
            className={`budget-form-scope-btn${scope === "loop" ? " active" : ""}`}
            onClick={() => setScope("loop")}
          >
            {intl.formatMessage({ id: "budget.scopeLoop" })}
          </button>
          <button
            className={`budget-form-scope-btn${scope === "fleet" ? " active" : ""}`}
            onClick={() => setScope("fleet")}
          >
            {intl.formatMessage({ id: "budget.scopeFleet" })}
          </button>
        </div>
      </div>

      {scope === "loop" ? (
        <>
          <div className="budget-form-row">
            <label className="budget-form-label">{intl.formatMessage({ id: "budget.environmentLabel" })}</label>
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
            <label className="budget-form-label">{intl.formatMessage({ id: "budget.loopIdLabel" })}</label>
            <select
              className="budget-form-select"
              value={loopId}
              onChange={(e) => setLoopId(e.target.value)}
            >
              <option value="">{intl.formatMessage({ id: "budget.loopIdPlaceholder" })}</option>
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
        <label className="budget-form-label">{intl.formatMessage({ id: "budget.thresholdLabel" })}</label>
        <input
          className="budget-form-input"
          type="number"
          min="1"
          value={threshold}
          placeholder={intl.formatMessage({ id: "budget.thresholdPlaceholder" })}
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
          <span>{intl.formatMessage({ id: "budget.autoPauseLabel" })}</span>
        </label>
        <span className="budget-form-checkbox-desc">
          {intl.formatMessage({ id: "budget.autoPauseDescription" })}
        </span>
      </div>

      {error ? <div className="budget-form-error">{error}</div> : null}

      <div className="budget-form-actions">
        <button className="btn" onClick={onCancel}>
          {intl.formatMessage({ id: "vmWizard.cancel" })}
        </button>
        <button className="btn primary" onClick={handleSubmit}>
          {intl.formatMessage({ id: "budget.addWatch" })}
        </button>
      </div>
    </div>
  );
}
