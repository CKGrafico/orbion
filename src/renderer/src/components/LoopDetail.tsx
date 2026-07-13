import { useEffect, useState } from "react";
import type { Environment, LoopMeta } from "../types";
import { fetchLoop } from "../api";
import { STATUS_COLORS, commandLine, timeAgo, timeUntil } from "../format";
import { LogViewer } from "./LogViewer";
import { Icon } from "./Icon";

export function LoopDetail(props: {
  instance: Environment;
  loopId: string;
  initial: LoopMeta | null;
  onBack: () => void;
}): React.ReactNode {
  const { instance, loopId, initial, onBack } = props;
  const [loop, setLoop] = useState<LoopMeta | null>(initial);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      const res = await fetchLoop(instance, loopId);
      if (!cancelled && res.ok && res.data) setLoop(res.data);
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [instance.id, instance.activeEndpointId, loopId]);

  const title =
    loop?.description?.trim() || (loop ? commandLine(loop.command, loop.commandArgs) : loopId);
  const failed = loop && loop.lastExitCode !== null && loop.lastExitCode !== 0;

  return (
    <div className="content-inner">
      <div className="detail-header">
        <button className="icon-btn" title="Back to loops" onClick={onBack}>
          <Icon name="arrowLeft" size={15} />
        </button>
        <span className="detail-title">{title}</span>
        {loop ? (
          <span
            className="chip"
            style={{ color: STATUS_COLORS[loop.status] ?? "var(--text-secondary)" }}
          >
            ● {loop.status}
          </span>
        ) : null}
      </div>

      {loop ? (
        <div className="card">
          <div className="card-header">
            <span className="overline">Overview</span>
            <span className="spacer" />
            <span className="card-stat">{loop.id}</span>
          </div>
          <div className="meta-grid">
            <div className="meta-item">
              <div className="label">Interval</div>
              <div className="value">{loop.intervalHuman}</div>
            </div>
            <div className="meta-item">
              <div className="label">Next run</div>
              <div className="value">{loop.nextRunAt ? timeUntil(loop.nextRunAt) : "—"}</div>
            </div>
            <div className="meta-item">
              <div className="label">Last run</div>
              <div className="value">{timeAgo(loop.lastRunAt)}</div>
            </div>
            <div className="meta-item">
              <div className="label">Last exit</div>
              <div className="value" style={failed ? { color: "var(--danger)" } : undefined}>
                {loop.lastExitCode === null ? "—" : loop.lastExitCode}
              </div>
            </div>
            <div className="meta-item">
              <div className="label">Runs</div>
              <div className="value">
                {loop.runCount}
                {loop.maxRuns ? ` / ${loop.maxRuns}` : ""}
              </div>
            </div>
            <div className="meta-item">
              <div className="label">PID</div>
              <div className="value">{loop.pid ?? "—"}</div>
            </div>
            <div className="meta-item">
              <div className="label">Working dir</div>
              <div className="value mono">{loop.cwd}</div>
            </div>
            <div className="meta-item">
              <div className="label">Command</div>
              <div className="value mono">{commandLine(loop.command, loop.commandArgs)}</div>
            </div>
          </div>
        </div>
      ) : null}

      <LogViewer instance={instance} loopId={loopId} />
    </div>
  );
}
