import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import type { Environment, TaskDefinition } from "../types";
import { fetchTasks } from "../api";
import { commandLine } from "../format";
import { List } from "lucide-react";

export function TasksView(props: { instance: Environment; filter: string }): React.ReactNode {
  const { instance, filter } = props;
  const intl = useIntl();
  const [tasks, setTasks] = useState<TaskDefinition[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      const res = await fetchTasks(instance);
      if (!cancelled && res.ok && Array.isArray(res.data)) {
        setTasks(res.data);
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

  const nameOf = (id: string | null): string | null =>
    id ? (tasks.find((t) => t.id === id)?.name ?? id.slice(0, 8)) : null;

  const q = filter.trim().toLowerCase();
  const visible = q
    ? tasks.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          commandLine(t.command, t.commandArgs).toLowerCase().includes(q),
      )
    : tasks;

  if (loaded && tasks.length === 0) {
    return (
      <div className="content-inner">
        <div className="empty">
          <span className="glyph">
            <List size={30} strokeWidth={1.2} />
          </span>
          <h3>{intl.formatMessage({ id: "tasks.noTasks" })}</h3>
          <p>{intl.formatMessage({ id: "tasks.noTasksDescription" })}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content-inner">
      <div className="card">
        <div className="card-header">
          <span className="overline">{intl.formatMessage({ id: "tasks.count" }, { count: tasks.length })}</span>
          <span className="spacer" />
        </div>
        <div className="card-body">
          <div className="loop-list">
            {visible.map((task) => {
              const onOk = nameOf(task.onSuccessTaskId);
              const onFail = nameOf(task.onFailureTaskId);
              return (
                <div key={task.id} className="loop-row static">
                  <span className="dot" style={{ background: "var(--accent-task)" }} />
                  <span className="desc">{task.name}</span>
                  <span className="right">
                    <span className="stat" style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {commandLine(task.command, task.commandArgs)}
                    </span>
                    {onOk ? (
                      <span className="stat" title={intl.formatMessage({ id: "tasks.onSuccess" })} style={{ color: "var(--success)" }}>
                        ✓→{onOk}
                      </span>
                    ) : null}
                    {onFail ? (
                      <span className="stat" title={intl.formatMessage({ id: "tasks.onFailure" })} style={{ color: "var(--danger)" }}>
                        ✗→{onFail}
                      </span>
                    ) : null}
                  </span>
                </div>
              );
            })}
            {q && visible.length === 0 ? (
              <div className="row-empty">{intl.formatMessage({ id: "tasks.noMatch" }, { filter })}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
