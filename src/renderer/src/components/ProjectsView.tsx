import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import type { Environment, LoopMeta, Project } from "../types";
import { fetchProjects } from "../api";
import { Folder } from "lucide-react";

export function ProjectsView(props: {
  instance: Environment;
  loops: LoopMeta[];
  filter: string;
}): React.ReactNode {
  const { instance, loops, filter } = props;
  const intl = useIntl();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      const res = await fetchProjects(instance);
      if (!cancelled && res.ok && Array.isArray(res.data)) {
        setProjects(res.data);
        setLoaded(true);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [instance.id, instance.activeEndpointId]);

  const loopCount = (projectId: string): number =>
    loops.filter((l) => (l.projectId ?? "default") === projectId).length;

  const q = filter.trim().toLowerCase();
  const visible = q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;

  if (loaded && projects.length === 0) {
    return (
      <div className="content-inner">
        <div className="empty">
          <span className="glyph">
            <Folder size={30} strokeWidth={1.2} />
          </span>
          <h3>{intl.formatMessage({ id: "projects.noProjects" })}</h3>
          <p>{intl.formatMessage({ id: "projects.noProjectsDescription" })}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content-inner">
      <div className="card">
        <div className="card-header">
          <span className="overline">{intl.formatMessage({ id: "projects.count" }, { count: projects.length })}</span>
          <span className="spacer" />
        </div>
        <div className="card-body">
          <div className="loop-list">
            {visible.map((project) => (
              <div key={project.id} className="loop-row static">
                <span className="dot" style={{ background: project.color }} />
                <span className="desc">{project.name}</span>
                <span className="right">
                  {project.isSystem ? <span className="overline">{intl.formatMessage({ id: "projects.system" })}</span> : null}
                  <span className="stat">{intl.formatMessage({ id: "projects.loopsCount" }, { count: loopCount(project.id) })}</span>
                  <span className="when">{project.createdAt.slice(0, 10)}</span>
                </span>
              </div>
            ))}
            {q && visible.length === 0 ? (
              <div className="row-empty">{intl.formatMessage({ id: "projects.noMatch" }, { filter })}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
