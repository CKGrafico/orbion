import React, { useMemo } from "react";
import { useIntl } from "react-intl";
import type { LoopMeta, LoopStatus, FleetLoopRollup } from "../types";
import { useNextRunCountdown } from "./useNextRunCountdown";
import type { PipelineCounts } from "./usePipelineCounts";

/** "healthy" = running+waiting. Individual exception statuses and pipeline labels are their own segments. */
export type LoopSegmentKind = "healthy" | "failed" | "paused" | "stopped" | "finished" | `pipeline:${string}`;

interface LoopSummaryBarProps {
  loops: LoopMeta[];
  reachability?: "connected" | "reconnecting" | "unreachable";
  onSegmentClick?: (kind: LoopSegmentKind) => void;
  fleetMode?: boolean;
  fleetRollup?: FleetLoopRollup;
  pipelineCounts?: PipelineCounts | null;
}

const HEALTHY_STATUSES: Set<LoopStatus> = new Set(["running", "waiting"]);

const EXCEPTION_STATUSES: LoopStatus[] = ["failed", "paused", "stopped", "finished"];

const EXCEPTION_COLORS: Record<string, string> = {
  failed: "var(--danger)",
  paused: "var(--status-paused)",
  stopped: "var(--status-stopped)",
  finished: "var(--status-finished)",
};

export function LoopSummaryBar({ loops, reachability, onSegmentClick, fleetMode, fleetRollup, pipelineCounts }: LoopSummaryBarProps): React.ReactNode {
  const intl = useIntl();

  const isReachable = reachability === "connected" || reachability === undefined;

  if (fleetMode) {
    return <FleetLoopSummaryBar fleetRollup={fleetRollup} onSegmentClick={onSegmentClick} />;
  }

  const counts = useMemo(() => {
    const result: Record<LoopStatus, number> = {
      running: 0,
      waiting: 0,
      paused: 0,
      stopped: 0,
      failed: 0,
      finished: 0,
    };
    for (const loop of loops) {
      result[loop.status]++;
    }
    return result;
  }, [loops]);

  const healthyCount = useMemo(
    () => loops.filter((l) => HEALTHY_STATUSES.has(l.status)).length,
    [loops],
  );

  const exceptions = useMemo(
    () => EXCEPTION_STATUSES.filter((s) => counts[s] > 0),
    [counts],
  );

  const nextRun = useMemo(() => {
    let earliest: { loopId: string; description: string; nextRunAt: string } | null = null;
    for (const loop of loops) {
      if (!loop.nextRunAt) continue;
      if (!earliest || loop.nextRunAt < earliest.nextRunAt) {
        earliest = {
          loopId: loop.id,
          description: loop.description?.trim() || loop.id,
          nextRunAt: loop.nextRunAt,
        };
      }
    }
    return earliest;
  }, [loops]);

  const countdown = useNextRunCountdown(nextRun?.nextRunAt ?? null);

  // When unreachable, show muted state so a dropped tunnel never reads as "everything failed."
  if (!isReachable && loops.length > 0) {
    return (
      <div className="loop-summary-bar loop-summary-bar--unknown">
        <span className="loop-summary-unknown-text">
          {intl.formatMessage(
            { id: "loopSummary.unknownState" },
            { count: loops.length },
          )}
        </span>
      </div>
    );
  }

  if (loops.length === 0) {
    return (
      <div className="loop-summary-bar loop-summary-bar--empty">
        <span className="loop-summary-empty-text">
          {intl.formatMessage({ id: "loopSummary.emptyState" })}
        </span>
      </div>
    );
  }

  return (
    <div className="loop-summary-bar">
      <div className="loop-summary-segments">
        {healthyCount > 0 ? (
          <span
            className="loop-summary-segment loop-summary-healthy loop-summary-segment--clickable"
            role="button"
            tabIndex={0}
            aria-label={intl.formatMessage({ id: "loopSummary.healthyCountAria" }, { count: healthyCount })}
            onClick={onSegmentClick ? () => onSegmentClick("healthy") : undefined}
            onKeyDown={onSegmentClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSegmentClick("healthy"); } } : undefined}
          >
            {intl.formatMessage(
              { id: "loopSummary.healthyCount" },
              { count: healthyCount },
            )}
          </span>
        ) : null}

        {exceptions.map((status) => (
          <span
            key={status}
            className={`loop-summary-segment loop-summary-exception${
              status === "failed" ? " loop-summary-exception--failed" : ""
            } loop-summary-segment--clickable`}
            style={{ color: EXCEPTION_COLORS[status] }}
            role="button"
            tabIndex={0}
            aria-label={intl.formatMessage({ id: `loopSummary.${status}CountAria` }, { count: counts[status] })}
            onClick={onSegmentClick ? () => onSegmentClick(status as LoopSegmentKind) : undefined}
            onKeyDown={onSegmentClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSegmentClick(status as LoopSegmentKind); } } : undefined}
          >
            {intl.formatMessage(
              { id: `loopSummary.${status}Count` },
              { count: counts[status] },
            )}
          </span>
        ))}

        {pipelineCounts ? (
          <>
            <span className="loop-summary-divider" />
            {Object.entries(pipelineCounts).map(([label, count]) => (
              <span
                key={`pipeline-${label}`}
                className="loop-summary-segment loop-summary-pipeline loop-summary-segment--clickable"
                role="button"
                tabIndex={0}
                aria-label={intl.formatMessage(
                  { id: "loopSummary.pipelineCountAria" },
                  { count: count < 0 ? 0 : count, label },
                )}
                onClick={onSegmentClick ? () => onSegmentClick(`pipeline:${label}` as LoopSegmentKind) : undefined}
                onKeyDown={onSegmentClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSegmentClick(`pipeline:${label}` as LoopSegmentKind); } } : undefined}
              >
                {count < 0
                  ? intl.formatMessage({ id: "loopSummary.pipelineCountError" }, { label })
                  : intl.formatMessage({ id: "loopSummary.pipelineCount" }, { count, label })}
              </span>
            ))}
          </>
        ) : null}
      </div>

      {nextRun && countdown ? (
        <span className="loop-summary-next-run">
          {intl.formatMessage(
            { id: "loopSummary.nextRun" },
            { loop: nextRun.description, countdown },
          )}
        </span>
      ) : null}
    </div>
  );
}

// ── Fleet-mode sub-component ────────────────────────────────────────────

function FleetLoopSummaryBar({
  fleetRollup,
  onSegmentClick,
}: {
  fleetRollup?: FleetLoopRollup;
  onSegmentClick?: (kind: LoopSegmentKind) => void;
}): React.ReactNode {
  const intl = useIntl();

  if (!fleetRollup) {
    return (
      <div className="loop-summary-bar loop-summary-bar--empty loop-summary-bar--fleet">
        <span className="loop-summary-empty-text">
          {intl.formatMessage({ id: "loopSummary.fleetEmptyState" })}
        </span>
      </div>
    );
  }

  const { counts, projectCount, loopsWithOrigin } = fleetRollup;
  const totalLoops = loopsWithOrigin.length;

  if (totalLoops === 0) {
    return (
      <div className="loop-summary-bar loop-summary-bar--empty loop-summary-bar--fleet">
        <span className="loop-summary-empty-text">
          {intl.formatMessage({ id: "loopSummary.fleetEmptyState" })}
        </span>
      </div>
    );
  }

  const healthyCount = counts.running + counts.waiting;
  const exceptions = EXCEPTION_STATUSES.filter((s) => counts[s] > 0  );

  const fleetStatusKeys: Record<string, { count: string; aria: string }> = {
    failed: { count: "loopSummary.fleetFailed", aria: "loopSummary.fleetFailedAria" },
    paused: { count: "loopSummary.fleetPaused", aria: "loopSummary.fleetPausedAria" },
    stopped: { count: "loopSummary.fleetStopped", aria: "loopSummary.fleetStoppedAria" },
    finished: { count: "loopSummary.fleetFinished", aria: "loopSummary.fleetFinishedAria" },
  };

  return (
    <div className="loop-summary-bar loop-summary-bar--fleet">
      <div className="loop-summary-segments">
        <span className="loop-summary-fleet-prefix">
          {intl.formatMessage(
            { id: "loopSummary.fleetAcrossProjects" },
            { projectCount },
          )}
        </span>

        {healthyCount > 0 ? (
          <span
            className="loop-summary-segment loop-summary-healthy loop-summary-segment--clickable"
            role="button"
            tabIndex={0}
            aria-label={intl.formatMessage({ id: "loopSummary.fleetRunningAria" }, { count: healthyCount })}
            onClick={onSegmentClick ? () => onSegmentClick("healthy") : undefined}
            onKeyDown={onSegmentClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSegmentClick("healthy"); } } : undefined}
          >
            {intl.formatMessage(
              { id: "loopSummary.fleetRunning" },
              { count: healthyCount },
            )}
          </span>
        ) : null}

        {exceptions.map((status) => {
          const keys = fleetStatusKeys[status];
          return (
            <span
              key={status}
              className={`loop-summary-segment loop-summary-exception${
                status === "failed" ? " loop-summary-exception--failed" : ""
              } loop-summary-segment--clickable`}
              style={{ color: EXCEPTION_COLORS[status] }}
              role="button"
              tabIndex={0}
              aria-label={intl.formatMessage({ id: keys.aria }, { count: counts[status] })}
              onClick={onSegmentClick ? () => onSegmentClick(status as LoopSegmentKind) : undefined}
              onKeyDown={onSegmentClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSegmentClick(status as LoopSegmentKind); } } : undefined}
            >
              {intl.formatMessage(
                { id: keys.count },
                { count: counts[status] },
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
