import type { Instance, InstanceHealth } from "../types";
import { Icon } from "./Icon";

const HEALTH_COLORS: Record<InstanceHealth, string> = {
  ok: "#a9d95c",
  offline: "#ff8484",
  unknown: "#64718c",
};

export function Sidebar(props: {
  instances: Instance[];
  selectedId: string | null;
  health: Record<string, InstanceHealth>;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}): React.ReactNode {
  const { instances, selectedId, health, onSelect, onAdd, onRemove } = props;

  return (
    <div className="sidebar">
      <button className="sidebar-action" onClick={onAdd}>
        <Icon name="plus" size={14} />
        <span>Add instance</span>
      </button>

      <div className="sidebar-section">
        <span className="overline">Instances</span>
        <span className="overline">{instances.length || ""}</span>
      </div>

      <div className="sidebar-list">
        {instances.length === 0 ? (
          <div style={{ padding: "6px 10px", fontSize: 12.5, color: "var(--text-muted)" }}>
            No instances yet
          </div>
        ) : (
          instances.map((instance) => (
            <button
              key={instance.id}
              className={`instance-item${instance.id === selectedId ? " selected" : ""}`}
              onClick={() => onSelect(instance.id)}
              title={instance.baseUrl}
            >
              <span
                className="dot"
                style={{ background: HEALTH_COLORS[health[instance.id] ?? "unknown"] }}
              />
              <span className="name">{instance.name}</span>
              <span
                className="remove"
                role="button"
                title="Remove instance"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Remove instance "${instance.name}"?`)) {
                    onRemove(instance.id);
                  }
                }}
              >
                <Icon name="x" size={12} />
              </span>
            </button>
          ))
        )}
      </div>

      <div className="sidebar-footer">
        <span className="avatar">LT</span>
        <span>Loop Task App</span>
      </div>
    </div>
  );
}
