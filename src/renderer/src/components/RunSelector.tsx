import { useState } from "react";
import { useIntl } from "react-intl";
import type { RunRecord } from "../types";
import { ChevronRight, ChevronDown } from "lucide-react";

function runStatusColor(run: RunRecord): string {
  if (run.status === "running") return "var(--status-running)";
  if (run.exitCode === 0) return "var(--success)";
  if (run.exitCode !== null && run.exitCode !== 0) return "var(--danger)";
  return "var(--text-muted)";
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function RunSelector({
  runHistory,
  onSelectRun,
}: {
  runHistory: RunRecord[];
  onSelectRun: (runNumber: number) => void;
}): React.ReactNode {
  const intl = useIntl();
  const [collapsed, setCollapsed] = useState(true);

  if (runHistory.length === 0) return null;

  const latestRun = runHistory[runHistory.length - 1];
  // Show runs in reverse chronological order
  const displayRuns = [...runHistory].reverse();

  return (
    <div className="run-selector">
      <button
        className="run-selector-header"
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="run-selector-label">
          {intl.formatMessage({ id: "runSelector.title" })}
        </span>
        <span className="run-selector-chevron">
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>

      {collapsed ? (
        <div className="run-selector-summary">
          <span
            className="run-selector-dot"
            style={{ color: runStatusColor(latestRun) }}
          >
            ●
          </span>
          <span className="run-selector-run-label">
            {intl.formatMessage({ id: "runSelector.runN" }, { number: latestRun.runNumber })}
          </span>
        </div>
      ) : (
        <div className="run-selector-list">
          {displayRuns.map((run) => (
            <button
              key={run.runNumber}
              className="run-selector-entry"
              onClick={() => onSelectRun(run.runNumber)}
            >
              <span
                className="run-selector-dot"
                style={{ color: runStatusColor(run) }}
              >
                ●
              </span>
              <span className="run-selector-run-label">
                {intl.formatMessage({ id: "runSelector.runN" }, { number: run.runNumber })}
              </span>
              {run.exitCode !== null && (
                <span className={`run-selector-exit ${run.exitCode === 0 ? "exit-ok" : "exit-bad"}`}>
                  exit {run.exitCode}
                </span>
              )}
              {run.duration !== null && (
                <span className="run-selector-duration">{formatDuration(run.duration)}</span>
              )}
              <span className="run-selector-time">
                {run.startedAt ? new Date(run.startedAt).toLocaleTimeString() : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
