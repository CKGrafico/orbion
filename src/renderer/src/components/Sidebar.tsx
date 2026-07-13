import type { ConnectionStatus, EndpointHealth } from "../../../shared/ipc";
import type { Environment, EnvironmentHealth, AccessEndpoint } from "../types";
import { Icon } from "./Icon";
import { hostLabel } from "../format";

const HEALTH_COLORS: Record<EnvironmentHealth, string> = {
  ok: "#a9d95c",
  offline: "#ff8484",
  unknown: "#64718c",
  connecting: "#f0c040",
  backoff: "#f08040",
  blocked: "#e040e0",
};

const ENDPOINT_PHASE_COLORS: Record<string, string> = {
  connected: "#a9d95c",
  backoff: "#f08040",
  offline: "#ff8484",
};

const KIND_LABELS: Record<string, string> = {
  direct: "Direct",
  ssh: "SSH",
  tailscale: "Tailscale",
};

function healthTooltip(health: EnvironmentHealth, status?: ConnectionStatus | null): string {
  if (status) {
    switch (status.phase) {
      case "connected": return "Connected";
      case "connecting": return "Connecting…";
      case "backoff": return `Retrying in ${Math.round(status.backoffMs / 1000)}s (${status.failureCount} failures)`;
      case "blocked": return status.lastError ?? "Blocked";
      case "offline": return status.lastError ?? "Offline — no network";
    }
  }
  return health;
}

function endpointLabel(ep: AccessEndpoint): string {
  return `${KIND_LABELS[ep.kind] ?? ep.kind}: ${hostLabel(ep.url)}`;
}

export function Sidebar(props: {
  environments: Environment[];
  selectedId: string | null;
  health: Record<string, EnvironmentHealth>;
  connectionStatus?: Record<string, ConnectionStatus>;
  endpointHealth?: Record<string, EndpointHealth[]>;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onRetry?: (id: string) => void;
  onSetEndpoint?: (environmentId: string, endpointId: string) => void;
}): React.ReactNode {
  const { environments, selectedId, health, connectionStatus, endpointHealth, onSelect, onAdd, onRemove, onRetry, onSetEndpoint } = props;

  return (
    <div className="sidebar">
      <button className="sidebar-action" onClick={onAdd}>
        <Icon name="plus" size={14} />
        <span>Add environment</span>
      </button>

      <div className="sidebar-section">
        <span className="overline">Environments</span>
        <span className="overline">{environments.length || ""}</span>
      </div>

      <div className="sidebar-list">
        {environments.length === 0 ? (
          <div style={{ padding: "6px 10px", fontSize: 12.5, color: "var(--text-muted)" }}>
            No environments yet
          </div>
        ) : (
          environments.map((env) => {
            const h = health[env.id] ?? "unknown";
            const cs = connectionStatus?.[env.id];
            const epHealth = endpointHealth?.[env.id];
            const activeEp = env.activeEndpointId
              ? env.endpoints.find((e) => e.id === env.activeEndpointId)
              : env.endpoints[0];
            return (
            <div key={env.id}>
              <button
                className={`instance-item${env.id === selectedId ? " selected" : ""}`}
                onClick={() => onSelect(env.id)}
                title={healthTooltip(h, cs)}
              >
                <span
                  className="dot"
                  style={{ background: HEALTH_COLORS[h] }}
                />
                <span className="name">{env.name}</span>
                {activeEp ? (
                  <span className="stat" style={{ fontSize: 10, color: "var(--text-muted)", marginRight: 2 }}>
                    {KIND_LABELS[activeEp.kind] ?? activeEp.kind}
                  </span>
                ) : null}
                {(h === "backoff" || h === "blocked") && onRetry ? (
                  <span
                    className="remove"
                    role="button"
                    title="Retry connection"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRetry(env.id);
                    }}
                  >
                    <Icon name="rotate" size={12} />
                  </span>
                ) : null}
                <span
                  className="remove"
                  role="button"
                  title="Remove environment"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Remove environment "${env.name}"?`)) {
                      onRemove(env.id);
                    }
                  }}
                >
                  <Icon name="x" size={12} />
                </span>
              </button>
              {env.endpoints.length > 1 && env.id === selectedId ? (
                <div style={{ paddingLeft: 12 }}>
                  {env.endpoints.map((ep) => {
                    const epH = epHealth?.find((h) => h.endpointId === ep.id);
                    return (
                    <button
                      key={ep.id}
                      className={`instance-item${ep.id === env.activeEndpointId ? " selected" : ""}`}
                      style={{ fontSize: 11, opacity: ep.id === env.activeEndpointId ? 1 : 0.6, padding: "3px 10px" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetEndpoint?.(env.id, ep.id);
                      }}
                      title={epH?.lastError ? `${endpointLabel(ep)} — ${epH.lastError}` : endpointLabel(ep)}
                    >
                      <span
                        className="dot"
                        style={{
                          background: ep.id === env.activeEndpointId ? "#5cb2ff" : (epH ? (ENDPOINT_PHASE_COLORS[epH.phase] ?? "#64718c") : "#64718c"),
                          width: 6,
                          height: 6,
                        }}
                      />
                      <span className="name">{KIND_LABELS[ep.kind] ?? ep.kind}: {hostLabel(ep.url)}</span>
                      {epH && epH.failureCount > 0 ? (
                        <span className="stat" style={{ fontSize: 9, color: "var(--danger)", marginLeft: 4 }}>
                          {epH.failureCount}err
                        </span>
                      ) : null}
                    </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            );
          })
        )}
      </div>

      <div className="sidebar-footer">
        <span className="avatar">OB</span>
        <span>Orbion</span>
      </div>
    </div>
  );
}
