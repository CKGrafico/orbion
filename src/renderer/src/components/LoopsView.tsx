import { useEffect, useMemo, useState } from "react";
import type { Environment, EnvironmentHealth, LoopMeta, Project } from "../types";
import { fetchProjects, resolveBaseUrl } from "../api";
import { STATUS_COLORS, commandLine, timeAgo, timeUntil } from "../format";
import { Icon } from "./Icon";

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
            <Icon name="rotate" size={30} strokeWidth={1.2} />
          </span>
          <h3>{disconnected ? "Environment unreachable" : "No loops"}</h3>
          <p>
            {disconnected
              ? `Could not reach ${baseUrl}. Is the loop-task daemon running?`
              : "This environment has no loops yet. Create one with the loop-task CLI or board."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="content-inner">
      <div className="card">
        <div className="card-header">
          <span className="overline">Loops ({loops.length})</span>
          {running > 0 ? <span className="card-stat ok">{running} running</span> : null}
          {failing > 0 ? <span className="card-stat bad">{failing} failing</span> : null}
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
                      title="project"
                      style={{ background: projectColor(loop), width: 6, height: 6 }}
                    />
                  ) : null}
                  <span className="right">
                    <span className="stat">{loop.intervalHuman}</span>
                    <span className="stat">×{loop.runCount}</span>
                    {failed ? (
                      <span className="exit-bad" title={`last exit ${loop.lastExitCode}`}>
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
              <div className="row-empty">No loops match "{filter}".</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
