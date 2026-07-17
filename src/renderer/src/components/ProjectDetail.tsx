import { useIntl } from "react-intl";
import type { LoopMeta, Project } from "../types";
import { loopStatusToFleetItem } from "../fleet-mapping";
import { PILL_COLORS, getPillLabel } from "../fleet-status";
import { runsToday, avgDuration, formatDurationShort } from "../format";
import { Folder } from "lucide-react";

function LoopActivitySummary({ loop }: { loop: LoopMeta }): React.ReactNode {
  const intl = useIntl();
  const todayCount = runsToday(loop.runHistory);
  const avg = avgDuration(loop.runHistory);

  if (todayCount === 0 && avg === null) return null;

  return (
    <span className="loop-activity">
      {todayCount > 0 ? (
        <span className="loop-activity-item">
          {intl.formatMessage({ id: "activitySummary.runsToday" }, { count: todayCount })}
        </span>
      ) : null}
      {avg !== null ? (
        <span className="loop-activity-item">
          {intl.formatMessage({ id: "activitySummary.avgDuration" }, { value: formatDurationShort(avg) })}
        </span>
      ) : null}
    </span>
  );
}

export function ProjectDetail(props: {
  project: Project;
  loops: LoopMeta[];
  onOpenLoop: (loopId: string) => void;
}): React.ReactNode {
  const { project, loops, onOpenLoop } = props;
  const intl = useIntl();

  if (loops.length === 0) {
    return (
      <div className="content-inner">
        <div className="empty">
          <span className="glyph">
            <Folder size={30} strokeWidth={1.2} />
          </span>
          <h3>{intl.formatMessage({ id: "projectDetail.noLoops" })}</h3>
          <p>{intl.formatMessage({ id: "projectDetail.noLoopsDescription" })}</p>
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
          <span className="overline">{intl.formatMessage({ id: "projectDetail.loopsCount" }, { count: loops.length })}</span>
        </div>
        <div className="card-body">
          <div className="loop-list">
            {loops.map((loop) => {
              const fleetItem = loopStatusToFleetItem(loop.status, loop.lastExitCode);
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
