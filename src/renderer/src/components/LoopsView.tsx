import { useEffect, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import type { Environment, EnvironmentHealth, LoopMeta, Project } from "../types";
import { fetchProjects, resolveBaseUrl } from "../api";
import { STATUS_COLORS, commandLine, timeAgo, timeUntil } from "../format";
import { RotateCw } from "lucide-react";

function loopLabel(loop: LoopMeta): string {
  return loop.description?.trim() || commandLine(loop.command, loop.commandArgs);
}

export function LoopsView(props: {
  instance: Environment;
  loops: LoopMeta[];
  filter: string;
  health: EnvironmentHealth;
  onOpenLoop: (id: string) => void;
}): React.ReactNode {
  const { instance, loops, filter, health, onOpenLoop } = props;
  const intl = useIntl();
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchProjects(instance).then((res) => {
      if (!cancelled && res.ok && Array.isArray(res.data)) setProjects(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [instance.id, instance.activeEndpointId]);

  const projectColor = (loop: LoopMeta): string | undefined =>
    projects.find((p) => p.id === loop.projectId)?.color;

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return loops;
    return loops.filter(
      (l) =>
        loopLabel(l).toLowerCase().includes(q) ||
        l.status.toLowerCase().includes(q) ||
        l.id.toLowerCase().includes(q),
    );
  }, [loops, filter]);

  const failing = loops.filter((l) => l.lastExitCode !== null && l.lastExitCode !== 0).length;
  const running = loops.filter((l) => l.status === "running").length;

  if (loops.length === 0) {
    const disconnected = health === "offline" || health === "backoff" || health === "blocked";
    const baseUrl = resolveBaseUrl(instance);
    return (
      <div className="content-inner">
        <div className="empty">
          <span className="glyph">
            <RotateCw size={30} strokeWidth={1.2} />
          </span>
          <h3>{disconnected ? intl.formatMessage({ id: "loops.envUnreachable" }) : intl.formatMessage({ id: "loops.noLoops" })}</h3>
          <p>
            {disconnected
              ? intl.formatMessage({ id: "loops.cannotReach" }, { url: baseUrl })
              : intl.formatMessage({ id: "loops.noLoopsDescription" })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="content-inner">
      <div className="card">
        <div className="card-header">
          <span className="overline">{intl.formatMessage({ id: "loops.count" }, { count: loops.length })}</span>
          {running > 0 ? <span className="card-stat ok">{intl.formatMessage({ id: "loops.running" }, { count: running })}</span> : null}
          {failing > 0 ? <span className="card-stat bad">{intl.formatMessage({ id: "loops.failing" }, { count: failing })}</span> : null}
          <span className="spacer" />
        </div>
        <div className="card-body">
          <div className="loop-list">
            {visible.map((loop) => {
              const failed = loop.lastExitCode !== null && loop.lastExitCode !== 0;
              return (
                <button key={loop.id} className="loop-row" onClick={() => onOpenLoop(loop.id)}>
                  <span
                    className="dot"
                    title={loop.status}
                    style={{ background: STATUS_COLORS[loop.status] ?? "var(--text-muted)" }}
                  />
                  <span className="desc">{loopLabel(loop)}</span>
                  {projectColor(loop) ? (
                    <span
                      className="dot"
                      title={intl.formatMessage({ id: "loops.project" })}
                      style={{ background: projectColor(loop), width: 6, height: 6 }}
                    />
                  ) : null}
                  <span className="right">
                    <span className="stat">{loop.intervalHuman}</span>
                    <span className="stat">×{loop.runCount}</span>
                    {failed ? (
                      <span className="exit-bad" title={intl.formatMessage({ id: "loops.lastExit" }, { code: loop.lastExitCode })}>
                        ✗{loop.lastExitCode}
                      </span>
                    ) : null}
                    <span
                      className="status"
                      style={{ color: STATUS_COLORS[loop.status] ?? "var(--text-muted)" }}
                    >
                      {loop.status}
                    </span>
                    <span className="when">
                      {loop.status === "running"
                        ? timeAgo(loop.lastRunAt)
                        : loop.nextRunAt
                          ? timeUntil(loop.nextRunAt)
                          : "—"}
                    </span>
                  </span>
                </button>
              );
            })}
            {visible.length === 0 ? (
              <div className="row-empty">{intl.formatMessage({ id: "loops.noMatch" }, { filter })}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
