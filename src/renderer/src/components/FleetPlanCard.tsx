import React, { useCallback, useState } from "react";
import { useIntl } from "react-intl";
import type { FleetPlanRow, FleetPlanTarget, FleetPlanStatus } from "../chat/types";

interface FleetPlanCardProps {
  row: FleetPlanRow;
  /** Callback when the user applies the plan. The parent is responsible for
   *  executing the checked targets and updating target statuses. */
  onApply: (planId: string, checkedTargets: FleetPlanTarget[]) => void;
  /** Callback when the user cancels the plan. */
  onCancel: (planId: string) => void;
  /** Callback when the plan or target status changes. */
  onStatusChange: (planId: string, status: FleetPlanStatus, error?: string) => void;
  /** Callback when a target's checked state changes. */
  onTargetCheckedChange: (planId: string, targetId: string, checked: boolean) => void;
}

/**
 * A plan card for fleet fan-out actions.
 *
 * When the user issues a fleet-wide action (e.g. "add test-watch to all Node
 * projects"), this card presents every resolved target (project x instance)
 * with a checkbox (default checked) and the concrete operation. The user can
 * deselect any targets, then click "Apply to N selected" to execute only the
 * checked targets. Per-target results (ok/failed) are reported inline.
 */
export function FleetPlanCard({
  row,
  onApply,
  onCancel,
  onStatusChange,
  onTargetCheckedChange,
  onTargetStatusChange,
}: FleetPlanCardProps): React.ReactNode {
  const intl = useIntl();

  // Local state for checkboxes, initialized from row.targets
  const [localTargets, setLocalTargets] = useState<Map<string, boolean>>(() => {
    const m = new Map<string, boolean>();
    for (const t of row.targets) {
      m.set(t.targetId, t.checked);
    }
    return m;
  });

  const isPending = row.status === "pending";
  const isApplying = row.status === "applying";
  const isApplied = row.status === "applied";
  const isCancelled = row.status === "cancelled";
  const isTerminal = isApplied || isCancelled;

  const checkedCount = row.targets.filter((t) => localTargets.get(t.targetId) !== false).length;

  const handleCheckChange = useCallback(
    (targetId: string): void => {
      setLocalTargets((prev) => {
        const next = new Map(prev);
        next.set(targetId, !prev.get(targetId));
        return next;
      });
      onTargetCheckedChange(row.planId, targetId, !localTargets.get(targetId));
    },
    [row.planId, localTargets, onTargetCheckedChange],
  );

  const handleApply = useCallback((): void => {
    const checkedTargets = row.targets.filter((t) => localTargets.get(t.targetId) !== false);
    onStatusChange(row.planId, "applying");
    onApply(row.planId, checkedTargets);
  }, [row.planId, row.targets, localTargets, onApply, onStatusChange]);

  const handleCancel = useCallback((): void => {
    onStatusChange(row.planId, "cancelled");
    onCancel(row.planId);
  }, [row.planId, onCancel, onStatusChange]);

  // Select / deselect all
  const allChecked = checkedCount === row.targets.length;
  const noneChecked = checkedCount === 0;

  const handleToggleAll = useCallback((): void => {
    const newState = !allChecked;
    setLocalTargets((prev) => {
      const next = new Map(prev);
      for (const t of row.targets) {
        next.set(t.targetId, newState);
      }
      return next;
    });
    for (const t of row.targets) {
      onTargetCheckedChange(row.planId, t.targetId, newState);
    }
  }, [row.planId, row.targets, allChecked, onTargetCheckedChange]);

  // Count result stats after apply
  const okCount = row.targets.filter((t) => t.status === "ok").length;
  const failedCount = row.targets.filter((t) => t.status === "failed").length;

  return (
    <div className={`fleet-plan-card${isTerminal ? " fleet-plan-card--terminal" : ""}${isApplied && failedCount > 0 ? " fleet-plan-card--partial" : ""}`}>
      {/* Header */}
      <div className="fleet-plan-header">
        <span className="fleet-plan-icon">⇶</span>
        <span className="fleet-plan-title">{intl.formatMessage({ id: "fleetPlan.title" })}</span>
        {isApplied && (
          <span className={`fleet-plan-status${failedCount > 0 ? " fleet-plan-status--partial" : " fleet-plan-status--applied"}`}>
            {failedCount > 0
              ? intl.formatMessage({ id: "fleetPlan.statusPartial" }, { ok: okCount, failed: failedCount })
              : intl.formatMessage({ id: "fleetPlan.statusApplied" })}
          </span>
        )}
        {isCancelled && (
          <span className="fleet-plan-status fleet-plan-status--cancelled">
            {intl.formatMessage({ id: "fleetPlan.statusCancelled" })}
          </span>
        )}
      </div>

      {/* Description */}
      <div className="fleet-plan-description">{row.description}</div>

      {/* Target list */}
      <div className="fleet-plan-targets">
        {isPending && (
          <div className="fleet-plan-targets-header">
            <label className="fleet-plan-toggle-all">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={handleToggleAll}
                className="fleet-plan-checkbox"
                disabled={isApplying}
              />
              <span className="fleet-plan-toggle-all-label">
                {intl.formatMessage({ id: "fleetPlan.selectAll" })}
              </span>
            </label>
            <span className="fleet-plan-target-count">
              {intl.formatMessage({ id: "fleetPlan.targetCount" }, { count: row.targets.length })}
            </span>
          </div>
        )}
        {row.targets.map((target) => {
          const isChecked = localTargets.get(target.targetId) !== false;
          const targetStatus = target.status;
          const isSkipped = targetStatus === "skipped" || (isApplied && !isChecked);

          return (
            <div
              key={target.targetId}
              className={`fleet-plan-target${isSkipped ? " fleet-plan-target--skipped" : ""}${targetStatus === "ok" ? " fleet-plan-target--ok" : ""}${targetStatus === "failed" ? " fleet-plan-target--failed" : ""}${targetStatus === "running" ? " fleet-plan-target--running" : ""}`}
            >
              {/* Checkbox (only in pending / applying state) */}
              {isPending && (
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => handleCheckChange(target.targetId)}
                  className="fleet-plan-checkbox"
                  disabled={isApplying}
                />
              )}

              {/* Status icon after apply */}
              {isApplied && (
                <span className={`fleet-plan-target-status-icon${targetStatus === "ok" ? " fleet-plan-target-status-icon--ok" : ""}${targetStatus === "failed" ? " fleet-plan-target-status-icon--failed" : ""}${isSkipped ? " fleet-plan-target-status-icon--skipped" : ""}`}>
                  {targetStatus === "ok" ? "✓" : targetStatus === "failed" ? "✗" : isSkipped ? "—" : ""}
                </span>
              )}

              {/* Target info */}
              <div className="fleet-plan-target-info">
                <span className="fleet-plan-target-attribution">
                  <span className="fleet-plan-target-instance">{target.environmentName}</span>
                  <span className="fleet-plan-target-sep">·</span>
                  <span className="fleet-plan-target-project">{target.projectName}</span>
                </span>
                <span className="fleet-plan-target-operation">{target.operation}</span>
              </div>

              {/* Inline error */}
              {targetStatus === "failed" && target.error && (
                <div className="fleet-plan-target-error">{target.error}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Card-level error */}
      {row.error && (
        <div className="fleet-plan-error">{row.error}</div>
      )}

      {/* Action buttons */}
      {isPending && (
        <div className="fleet-plan-actions">
          <button
            className="fleet-plan-btn fleet-plan-btn--cancel"
            onClick={handleCancel}
            disabled={isApplying}
            type="button"
          >
            {intl.formatMessage({ id: "fleetPlan.cancel" })}
          </button>
          <button
            className="fleet-plan-btn fleet-plan-btn--apply"
            onClick={handleApply}
            disabled={isApplying || noneChecked}
            type="button"
          >
            {isApplying
              ? intl.formatMessage({ id: "fleetPlan.applying" })
              : intl.formatMessage({ id: "fleetPlan.applyToSelected" }, { count: checkedCount })}
          </button>
        </div>
      )}
    </div>
  );
}
