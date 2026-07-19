import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import type { BudgetWatch } from "../../../shared/ipc";
import type { ReachabilityState } from "../../../shared/ipc";
import type { Environment, LoopMeta } from "../types";
import { fetchLoop } from "../api";
import { STATUS_COLORS, commandLine, timeAgo, timeUntil, runsToday, avgDuration, lastRunDuration, formatDurationShort } from "../format";
import { LogViewer } from "./LogViewer";
import { BudgetWatchPanel } from "./BudgetWatchPanel";
import { ArrowLeft, Clock, WifiOff } from "lucide-react";
import { cid, useInject } from "inversify-hooks";
import type { IBudgetService } from "../services/interfaces";

export function LoopDetail(props: {
  instance: Environment;
  loopId: string;
  initial: LoopMeta | null;
  /** Per-environment reachability state (its own health layer, separate from loop status). */
  reachability?: ReachabilityState;
  onBack: () => void;
}): React.ReactNode {
  const { instance, loopId, initial, reachability, onBack } = props;
  const intl = useIntl();
  const [loop, setLoop] = useState<LoopMeta | null>(initial);
  const [budgetPanelOpen, setBudgetPanelOpen] = useState(false);
  const [budgetService] = useInject<IBudgetService>(cid.IBudgetService);
  const [watches, setWatches] = useState<BudgetWatch[]>([]);

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

  // Load watches for this loop
  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      const all = await budgetService.getWatches();
      if (cancelled) return;
      setWatches(all.filter((w) =>
        w.enabled && (w.scope === "fleet" || (w.loopId === loopId && w.environmentId === instance.id)),
      ));
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [budgetService, loopId, instance.id]);

  const title =
    loop?.description?.trim() || (loop ? commandLine(loop.command, loop.commandArgs) : loopId);
  const failed = loop && loop.lastExitCode !== null && loop.lastExitCode !== 0;
  const isUnreachable = reachability === "unreachable" || reachability === "reconnecting";

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
            style={{ color: isUnreachable ? "var(--status-unknown)" : STATUS_COLORS[loop.status] ?? "var(--text-secondary)" }}
          >
            ● {isUnreachable ? intl.formatMessage({ id: "loopDetail.statusUnknown" }) : intl.formatMessage({ id: `loopDetail.status${loop.status.charAt(0).toUpperCase()}${loop.status.slice(1)}` })}
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        <button
          className="icon-btn"
          title={intl.formatMessage({ id: "budget.title" })}
          onClick={() => setBudgetPanelOpen(true)}
          style={{ opacity: watches.length > 0 ? 1 : 0.5, color: watches.length > 0 ? "var(--warning)" : undefined }}
        >
          <Clock size={14} />
        </button>
      </div>

      {isUnreachable ? (
        <div className="stale-banner">
          <WifiOff size={13} />
          {intl.formatMessage({ id: "loopDetail.staleBanner" })}
        </div>
      ) : null}

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

      {budgetPanelOpen ? (
        <BudgetWatchPanel
          watches={watches}
          breaches={[]}
          environments={[instance]}
          perEnvLoops={{ [instance.id]: loop ? [loop] : [] }}
          onAddWatch={async (watch) => {
            await budgetService.addWatch(watch);
            const all = await budgetService.getWatches();
            setWatches(all.filter((w) =>
              w.enabled && (w.scope === "fleet" || (w.loopId === loopId && w.environmentId === instance.id)),
            ));
          }}
          onRemoveWatch={async (id) => {
            await budgetService.removeWatch(id);
            setWatches((prev) => prev.filter((w) => w.id !== id));
          }}
          onToggleWatch={async (id, enabled) => {
            await budgetService.updateWatch(id, { enabled });
            setWatches((prev) => prev.map((w) => w.id === id ? { ...w, enabled } : w));
          }}
          onDismissBreach={async () => {}}
          onResumeLoop={async () => {}}
          onClose={() => setBudgetPanelOpen(false)}
        />
      ) : null}
    </div>
  );
}
