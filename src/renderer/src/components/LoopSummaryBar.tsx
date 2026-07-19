import React, { useMemo } from "react";
import { useIntl } from "react-intl";
import type { LoopMeta, LoopStatus } from "../types";
import { useNextRunCountdown } from "./useNextRunCountdown";

interface LoopSummaryBarProps {
  /** Loops scoped to the session's home project x instance. */
  loops: LoopMeta[];
  /** Whether the instance is reachable. When not connected, the bar shows a muted unknown state. */
  reachability?: "connected" | "reconnecting" | "unreachable";
}

/** Healthy statuses that collapse to a single count. */
const HEALTHY_STATUSES: Set<LoopStatus> = new Set(["running", "waiting"]);

/** Exception statuses that get individual colored segments. */
const EXCEPTION_STATUSES: LoopStatus[] = ["failed", "paused", "finished"];

/** Color CSS variable for each exception status. Failures use the alert/danger color. */
const EXCEPTION_COLORS: Record<string, string> = {
  failed: "var(--danger)",
  paused: "var(--status-paused)",
  finished: "var(--status-finished)",
};

export function LoopSummaryBar({ loops, reachability }: LoopSummaryBarProps): React.ReactNode {
  const intl = useIntl();

  const isReachable = reachability === "connected" || reachability === undefined;

  const counts = useMemo(() => {
    const result: Record<LoopStatus, number> = {
      running: 0,
      waiting: 0,
      paused: 0,
      stopped: 0,
      idle: 0,
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
          <span className="loop-summary-segment loop-summary-healthy">
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
            }`}
            style={{ color: EXCEPTION_COLORS[status] }}
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
