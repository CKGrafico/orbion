import { useTranslation } from "react-i18next";
import type { LoopMeta, Project } from "../types";
import type { ReachabilityState } from "../../../shared/ipc";
import { loopStatusToFleetItem } from "../fleet-mapping";
import { PILL_COLORS, getPillLabel } from "../fleet-status";
import { runsToday, avgDuration, formatDurationShort } from "../format";
import { Folder } from "lucide-react";

function LoopActivitySummary({ loop }: { loop: LoopMeta }): React.ReactNode {
  const { t } = useTranslation();
  const todayCount = runsToday(loop.runHistory);
  const avg = avgDuration(loop.runHistory);

  if (todayCount === 0 && avg === null) return null;

  return (
    <span className="loop-activity">
      {todayCount > 0 ? (
        <span className="loop-activity-item">
          {t("activitySummary.runsToday", { count: todayCount })}
        </span>
      ) : null}
      {avg !== null ? (
        <span className="loop-activity-item">
          {t("activitySummary.avgDuration", { value: formatDurationShort(avg) })}
        </span>
      ) : null}
    </span>
  );
}

export function ProjectDetail(props: {
  project: Project;
  loops: LoopMeta[];
  /** Per-environment reachability state (its own health layer, separate from loop status). */
  reachability?: ReachabilityState;
  onOpenLoop: (loopId: string) => void;
}): React.ReactNode {
  const { project, loops, reachability, onOpenLoop } = props;
  const { t } = useTranslation();

  if (loops.length === 0) {
    return (
      <div className="content-inner">
        <div className="empty">
          <span className="glyph">
            <Folder size={30} strokeWidth={1.2} />
          </span>
          <h3>{t("projectDetail.noLoops")}</h3>
          <p>{t("projectDetail.noLoopsDescription")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content-inner">
      <div className="card">
        <div className="card-header">
          <span className="dot" style={{ background: project.color }} />
          <span className="overline">{project.name}</span>
          <span className="spacer" />
          <span className="overline">{t("projectDetail.loopsCount", { count: loops.length })}</span>
        </div>
        <div className="card-body">
          <div className="loop-list">
            {loops.map((loop) => {
              const fleetItem = loopStatusToFleetItem(loop.status, loop.lastExitCode, reachability);
              const loopTitle = loop.description?.trim() || loop.id;
              return (
                <button
                  key={loop.id}
                  className="loop-row"
                  onClick={() => onOpenLoop(loop.id)}
                >
                  <span className="tree-dot" style={{ background: PILL_COLORS[fleetItem] }} />
                  <span className="desc">{loopTitle}</span>
                  <span className="right">
                    <LoopActivitySummary loop={loop} />
                    <span className="status" style={{ color: PILL_COLORS[fleetItem] }}>
                      {getPillLabel(fleetItem)}
                    </span>
                    {loop.lastExitCode !== null && loop.lastExitCode !== 0 ? (
                      <span className="exit-bad">{loop.lastExitCode}</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
