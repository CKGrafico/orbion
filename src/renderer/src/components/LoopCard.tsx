import React from "react";
import { useIntl } from "react-intl";
import type { LoopMeta, LoopStatus } from "../types";
import { STATUS_COLORS, commandLine, timeUntil } from "../format";
import { useNextRunCountdown } from "./useNextRunCountdown";

interface LoopCardProps {
  /** The loop to display. Updated live from the loop store. */
  loop: LoopMeta;
  /** Whether the instance hosting this loop is reachable. */
  reachability?: "connected" | "reconnecting" | "unreachable";
}

/** Pulse animation for running status dots. */
const PULSING_STATUSES: Set<LoopStatus> = new Set(["running"]);

export function LoopCard({ loop, reachability }: LoopCardProps): React.ReactNode {
  const intl = useIntl();

  const isReachable = reachability === "connected" || reachability === undefined;
  const failed = loop.lastExitCode !== null && loop.lastExitCode !== 0;
  const isRunning = loop.status === "running";
  const isPulsing = PULSING_STATUSES.has(loop.status);

  // Derive display name: description > command > id
  const name = loop.description?.trim() || commandLine(loop.command, loop.commandArgs) || loop.id;

  // Next-run countdown
  const countdown = useNextRunCountdown(loop.nextRunAt);
  const nextRunLabel = isReachable
    ? (countdown ?? (loop.nextRunAt ? timeUntil(loop.nextRunAt) : intl.formatMessage({ id: "loopCard.noNextRun" })))
    : intl.formatMessage({ id: "loopCard.unknown" });

  // Exit code display
  const exitCodeLabel = loop.lastExitCode === null
    ? "-"
    : String(loop.lastExitCode);

  // Run count display
  const runCountLabel = loop.maxRuns
    ? `${loop.runCount}/${loop.maxRuns}`
    : String(loop.runCount);

  // Status dot color
  const dotColor = isReachable
    ? (STATUS_COLORS[loop.status] ?? "var(--text-secondary)")
    : "var(--status-unknown)";

  // Card classes
  const cardCls = [
    "loop-card",
    failed ? "loop-card--failed" : "",
    !isReachable ? "loop-card--unreachable" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={cardCls}>
      {/* Header row: status dot + name */}
      <div className="loop-card-header">
        <span
          className={`dot loop-card-dot${isPulsing ? " loop-card-dot--pulse" : ""}`}
          style={{ background: dotColor }}
        />
        <span className="loop-card-name">{name}</span>
        <span
          className="loop-card-status-chip"
          style={{ color: isReachable ? STATUS_COLORS[loop.status] : "var(--status-unknown)" }}
        >
          {isReachable
            ? intl.formatMessage({ id: `loopCard.status${loop.status.charAt(0).toUpperCase()}${loop.status.slice(1)}` })
            : intl.formatMessage({ id: "loopCard.statusUnknown" })}
        </span>
      </div>

      {/* Meta row: interval · runs · last exit · next run */}
      <div className="loop-card-meta">
        <span className="loop-card-meta-item">
          <span className="loop-card-meta-label">{intl.formatMessage({ id: "loopCard.interval" })}</span>
          <span className="loop-card-meta-value">{loop.intervalHuman}</span>
        </span>
        <span className="loop-card-meta-sep" />
        <span className="loop-card-meta-item">
          <span className="loop-card-meta-label">{intl.formatMessage({ id: "loopCard.runs" })}</span>
          <span className="loop-card-meta-value loop-card-meta-value--mono">{runCountLabel}</span>
        </span>
        <span className="loop-card-meta-sep" />
        <span className="loop-card-meta-item">
          <span className="loop-card-meta-label">{intl.formatMessage({ id: "loopCard.lastExit" })}</span>
          <span
            className={`loop-card-meta-value loop-card-meta-value--mono${failed ? " loop-card-meta-value--exit-fail" : ""}`}
          >
            {exitCodeLabel}
          </span>
        </span>
        <span className="loop-card-meta-sep" />
        <span className="loop-card-meta-item">
          <span className="loop-card-meta-label">{intl.formatMessage({ id: "loopCard.nextRun" })}</span>
          <span className="loop-card-meta-value loop-card-meta-value--mono">{isRunning ? intl.formatMessage({ id: "loopCard.runningNow" }) : nextRunLabel}</span>
        </span>
      </div>
    </div>
  );
}
