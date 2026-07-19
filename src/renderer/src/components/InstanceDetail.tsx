import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import type { Environment, LoopMeta, Project } from "../types";
import type { ReachabilityState } from "../../../shared/ipc";
import { fetchProjects } from "../api";
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

export function InstanceDetail(props: {
  instance: Environment;
  loops: LoopMeta[];
  connectionPhase?: string;
  /** Per-environment reachability state (its own health layer, separate from loop status). */
  reachability?: ReachabilityState;
  onOpenLoop: (loopId: string) => void;
  onOpenProject: (projectId: string) => void;
}): React.ReactNode {
  const { instance, loops, connectionPhase, reachability, onOpenLoop, onOpenProject } = props;
  const intl = useIntl();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (connectionPhase && connectionPhase !== "connected") return;

    let cancelled = false;
    const load = async (): Promise<void> => {
      const res = await fetchProjects(instance);
      if (!cancelled && res.ok && Array.isArray(res.data)) {
        setProjects(res.data as Project[]);
        setLoaded(true);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [instance.id, instance.activeEndpointId, connectionPhase]);

  // Group loops by project
  const loopsByProject = new Map<string, LoopMeta[]>();
  const unassignedLoops: LoopMeta[] = [];
  for (const loop of loops) {
    const pid = loop.projectId ?? "default";
    if (pid === "default" || !projects.some((p) => p.id === pid)) {
      unassignedLoops.push(loop);
    } else {
      const existing = loopsByProject.get(pid) ?? [];
      existing.push(loop);
      loopsByProject.set(pid, existing);
    }
  }

  if (loaded && projects.length === 0 && unassignedLoops.length === 0) {
    return (
      <div className="content-inner">
        <div className="empty">
          <span className="glyph">
            <Folder size={30} strokeWidth={1.2} />
          </span>
          <h3>{intl.formatMessage({ id: "instanceDetail.noProjects" })}</h3>
          <p>{intl.formatMessage({ id: "instanceDetail.noProjectsDescription" })}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content-inner">
      {/* Loops grouped by project */}
      {projects.map((project) => {
        const projectLoops = loopsByProject.get(project.id) ?? [];
        return (
          <div key={project.id} className="card">
            <div className="card-header">
              <span className="dot" style={{ background: project.color }} />
              <span className="overline">{project.name}</span>
              {project.isSystem ? <span className="overline" style={{ marginLeft: 4 }}>{intl.formatMessage({ id: "projects.system" })}</span> : null}
              <span className="spacer" />
              <span className="card-stat">{intl.formatMessage({ id: "projects.loopsCount" }, { count: projectLoops.length })}</span>
              <button
                className="icon-btn"
                style={{ marginLeft: 6, width: 24, height: 24, color: "var(--text-muted)" }}
                title={intl.formatMessage({ id: "instanceDetail.viewProject" }, { name: project.name })}
                onClick={() => onOpenProject(project.id)}
              >
                <Folder size={13} />
              </button>
            </div>
            <div className="card-body">
              <div className="loop-list">
                {projectLoops.length === 0 ? (
                  <div className="row-empty">{intl.formatMessage({ id: "instanceDetail.noLoopsInProject" })}</div>
                ) : (
                  projectLoops.map((loop) => {
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
                  })
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Unassigned loops */}
      {unassignedLoops.length > 0 ? (
        <div className="card">
          <div className="card-header">
            <span className="dot" style={{ background: "var(--text-muted)" }} />
            <span className="overline">{intl.formatMessage({ id: "instanceDetail.unassigned" })}</span>
            <span className="spacer" />
            <span className="card-stat">{intl.formatMessage({ id: "projects.loopsCount" }, { count: unassignedLoops.length })}</span>
          </div>
          <div className="card-body">
            <div className="loop-list">
              {unassignedLoops.map((loop) => {
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
      ) : null}
    </div>
  );
}
