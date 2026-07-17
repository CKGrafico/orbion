import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import type { Environment, LoopMeta } from "../types";
import { fetchLoop } from "../api";
import { STATUS_COLORS, commandLine, timeAgo, timeUntil, runsToday, avgDuration, lastRunDuration, formatDurationShort } from "../format";
import { LogViewer } from "./LogViewer";
import { ArrowLeft } from "lucide-react";

export function LoopDetail(props: {
  instance: Environment;
  loopId: string;
  initial: LoopMeta | null;
  onBack: () => void;
}): React.ReactNode {
  const { instance, loopId, initial, onBack } = props;
  const intl = useIntl();
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
        <button className="icon-btn" title={intl.formatMessage({ id: "loopDetail.backToLoops" })} onClick={onBack}>
          <ArrowLeft size={15} />
        </button>
        <span className="detail-title">{title}</span>
        {loop ? (
          <span
            className="chip"
            style={{ color: STATUS_COLORS[loop.status] ?? "var(--text-secondary)" }}
          >
            ● {intl.formatMessage({ id: `loopDetail.status${loop.status.charAt(0).toUpperCase()}${loop.status.slice(1)}` })}
          </span>
        ) : null}
      </div>

      {loop ? (
        <div className="card">
          <div className="card-header">
            <span className="overline">{intl.formatMessage({ id: "loopDetail.overview" })}</span>
            <span className="spacer" />
            <span className="card-stat">{loop.id}</span>
          </div>
          <div className="meta-grid">
            <div className="meta-item">
              <div className="label">{intl.formatMessage({ id: "loopDetail.interval" })}</div>
              <div className="value">{loop.intervalHuman}</div>
            </div>
            <div className="meta-item">
              <div className="label">{intl.formatMessage({ id: "loopDetail.nextRun" })}</div>
              <div className="value">{loop.nextRunAt ? timeUntil(loop.nextRunAt) : intl.formatMessage({ id: "loopDetail.emptyValue" })}</div>
            </div>
            <div className="meta-item">
              <div className="label">{intl.formatMessage({ id: "loopDetail.lastRun" })}</div>
              <div className="value">{timeAgo(loop.lastRunAt)}</div>
            </div>
            <div className="meta-item">
              <div className="label">{intl.formatMessage({ id: "loopDetail.lastExit" })}</div>
              <div className="value" style={failed ? { color: "var(--danger)" } : undefined}>
                {loop.lastExitCode === null ? "-" : loop.lastExitCode}
              </div>
            </div>
            <div className="meta-item">
              <div className="label">{intl.formatMessage({ id: "loopDetail.runs" })}</div>
              <div className="value">
                {loop.runCount}
                {loop.maxRuns ? ` / ${loop.maxRuns}` : ""}
              </div>
            </div>
            {(() => {
              const todayCount = runsToday(loop.runHistory);
              const avg = avgDuration(loop.runHistory);
              const lastDur = lastRunDuration(loop.runHistory);
              if (todayCount === 0 && avg === null && lastDur === null) return null;
              return (
                <>
                  <div className="meta-item">
                    <div className="label">{intl.formatMessage({ id: "loopDetail.activityToday" })}</div>
                    <div className="value">{todayCount}</div>
                  </div>
                  {avg !== null ? (
                    <div className="meta-item">
                      <div className="label">{intl.formatMessage({ id: "loopDetail.activityAvgDuration" })}</div>
                      <div className="value">{formatDurationShort(avg)}</div>
                    </div>
                  ) : null}
                  {lastDur !== null ? (
                    <div className="meta-item">
                      <div className="label">{intl.formatMessage({ id: "loopDetail.activityLastDuration" })}</div>
                      <div className="value">{formatDurationShort(lastDur)}</div>
                    </div>
                  ) : null}
                </>
              );
            })()}
            <div className="meta-item">
              <div className="label">{intl.formatMessage({ id: "loopDetail.pid" })}</div>
              <div className="value">{loop.pid ?? "-"}</div>
            </div>
            <div className="meta-item">
              <div className="label">{intl.formatMessage({ id: "loopDetail.workingDir" })}</div>
              <div className="value mono">{loop.cwd}</div>
            </div>
            <div className="meta-item">
              <div className="label">{intl.formatMessage({ id: "loopDetail.command" })}</div>
              <div className="value mono">{commandLine(loop.command, loop.commandArgs)}</div>
            </div>
          </div>
        </div>
      ) : null}

      <LogViewer instance={instance} loopId={loopId} runHistory={loop?.runHistory} />
    </div>
  );
}
