import React, { useMemo } from "react";
import { useIntl } from "react-intl";
import type { LoopMeta, LoopStatus } from "../types";
import { useNextRunCountdown } from "./useNextRunCountdown";

/** A segment that can be clicked in the summary bar.
 *  "healthy" covers running + waiting loops.
 *  Individual exception statuses (failed, paused, stopped, finished) are their own segments. */
export type LoopSegmentKind = "healthy" | "failed" | "paused" | "stopped" | "finished";

interface LoopSummaryBarProps {
  /** Loops scoped to the session's home project x instance. */
  loops: LoopMeta[];
  /** Whether the instance is reachable. When not connected, the bar shows a muted unknown state. */
  reachability?: "connected" | "reconnecting" | "unreachable";
  /** Called when the user clicks a bar segment. The handler should summon matching loop cards. */
  onSegmentClick?: (kind: LoopSegmentKind) => void;
}

/** Healthy statuses that collapse to a single count. */
const HEALTHY_STATUSES: Set<LoopStatus> = new Set(["running", "waiting"]);

/** Exception statuses that get individual colored segments. */
const EXCEPTION_STATUSES: LoopStatus[] = ["failed", "paused", "stopped", "finished"];

/** Color CSS variable for each exception status.
 *  Failed uses the alert/danger color; stopped gets warm amber distinct from failed;
 *  paused gets yellow (schedule kept); finished gets green (success). */
const EXCEPTION_COLORS: Record<string, string> = {
  failed: "var(--danger)",
  paused: "var(--status-paused)",
  stopped: "var(--status-stopped)",
  finished: "var(--status-finished)",
};

export function LoopSummaryBar({ loops, reachability, onSegmentClick }: LoopSummaryBarProps): React.ReactNode {
  const intl = useIntl();

  const isReachable = reachability === "connected" || reachability === undefined;

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

  /** Find the loop with the most imminent next run. */
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

  // When the instance is unreachable, show a muted state instead of
  // potentially stale counts. This ensures a dropped tunnel never
  // reads as "everything failed."
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

  // Empty state: no loops in scope
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
        {/* Healthy count: collapsed to a single number */}
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

        {/* Exception segments: only shown when their count is nonzero */}
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
      </div>

      {/* Next-run countdown (right-aligned, hidden when nothing scheduled) */}
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
