import { useIntl, type IntlShape } from "react-intl";
import type { ConnectionStatus, EndpointHealth } from "../../../shared/ipc";
import type { Environment, EnvironmentHealth, AccessEndpoint, OpenCodeConnectionStatus, OpenCodeAuthState } from "../types";
import type { FleetItemStatus } from "../fleet-status";
import { Terminal, RotateCw, X, Bell, BellOff } from "lucide-react";
import { StatusPill, UnreadDot } from "./StatusPill";
import { hostLabel } from "../format";
import { translateMessage } from "../i18n";

const HEALTH_COLORS: Record<EnvironmentHealth, string> = {
  ok: "var(--health-ok)",
  offline: "var(--health-offline)",
  unknown: "var(--health-unknown)",
  connecting: "var(--health-connecting)",
  backoff: "var(--health-backoff)",
  blocked: "var(--health-blocked)",
};

const ENDPOINT_PHASE_COLORS: Record<string, string> = {
  connected: "var(--endpoint-connected)",
  backoff: "var(--endpoint-backoff)",
  offline: "var(--endpoint-offline)",
};

const OPENCODE_AUTH_COLORS: Record<OpenCodeAuthState, string> = {
  authenticated: "var(--opencode-authenticated)",
  unauthenticated: "var(--opencode-unauthenticated)",
  unknown: "var(--opencode-unknown)",
};

function openCodeStatusLabel(intl: IntlShape, status: OpenCodeConnectionStatus): string {
  if (status.errorKind === "version") return intl.formatMessage({ id: "sidebar.ocVersionTooOld" }, { detail: translateMessage(intl, status.errorMessage) || "version too old" });
  if (status.errorKind === "unreachable") return intl.formatMessage({ id: "sidebar.ocUnreachable" });
  if (status.errorKind === "rejected") return intl.formatMessage({ id: "sidebar.ocRejected" }, { detail: translateMessage(intl, status.errorMessage) || "rejected" });
  switch (status.authState) {
    case "authenticated": return intl.formatMessage({ id: "sidebar.ocConnected" });
    case "unauthenticated": return intl.formatMessage({ id: "sidebar.ocAuthLogin" });
    case "unknown": return intl.formatMessage({ id: "sidebar.ocUnknown" });
  }
}

function kindLabel(intl: IntlShape, kind: string): string {
  switch (kind) {
    case "direct": return intl.formatMessage({ id: "sidebar.kindDirect" });
    case "ssh": return intl.formatMessage({ id: "sidebar.kindSsh" });
    case "tailscale": return intl.formatMessage({ id: "sidebar.kindTailscale" });
    default: return kind;
  }
}

function healthTooltip(intl: IntlShape, health: EnvironmentHealth, status?: ConnectionStatus | null): string {
  if (status) {
    switch (status.phase) {
      case "connected": return intl.formatMessage({ id: "sidebar.connected" });
      case "connecting": return intl.formatMessage({ id: "sidebar.connecting" });
      case "backoff": return intl.formatMessage({ id: "sidebar.retrying" }, { seconds: Math.round(status.backoffMs / 1000), failures: status.failureCount });
      case "blocked": return translateMessage(intl, status.lastError) || intl.formatMessage({ id: "sidebar.blockedTooltip" });
      case "offline": return translateMessage(intl, status.lastError) || intl.formatMessage({ id: "sidebar.offlineTooltip" });
    }
  }
  return health;
}

function endpointLabel(intl: IntlShape, ep: AccessEndpoint): string {
  return `${kindLabel(intl, ep.kind)}: ${hostLabel(ep.url)}`;
}

export function Sidebar(props: {
  environments: Environment[];
  selectedId: string | null;
  health: Record<string, EnvironmentHealth>;
  connectionStatus?: Record<string, ConnectionStatus>;
  endpointHealth?: Record<string, EndpointHealth[]>;
  openCodeStatus?: Record<string, OpenCodeConnectionStatus>;
  fleetStatus?: Record<string, FleetItemStatus>;
  unreadEnvs?: Set<string>;
  mutedEnvs?: Set<string>;
  onToggleMute?: (environmentId: string) => void;
  onSelect: (id: string) => void;
  onAddVm?: () => void;
  onRemove: (id: string) => void;
  onRetry?: (id: string) => void;
  onSetEndpoint?: (environmentId: string, endpointId: string) => void;
}): React.ReactNode {
  const { environments, selectedId, health, connectionStatus, endpointHealth, openCodeStatus, fleetStatus, unreadEnvs, mutedEnvs, onToggleMute, onSelect, onAddVm, onRemove, onRetry, onSetEndpoint } = props;
  const intl = useIntl();

  return (
    <div className="sidebar">
      <button className="sidebar-action" onClick={onAddVm}>
        <Terminal size={14} />
        <span>{intl.formatMessage({ id: "sidebar.addEnvironment" })}</span>
      </button>

      <div className="sidebar-section">
        <span className="overline">{intl.formatMessage({ id: "sidebar.environments" })}</span>
        <span className="overline">{environments.length || ""}</span>
      </div>

      <div className="sidebar-list">
        {environments.length === 0 ? (
          <div style={{ padding: "6px 10px", fontSize: 12.5, color: "var(--text-muted)" }}>
            {intl.formatMessage({ id: "sidebar.noEnvironments" })}
          </div>
        ) : (
          environments.map((env) => {
            const h = health[env.id] ?? "unknown";
            const cs = connectionStatus?.[env.id];
            const epHealth = endpointHealth?.[env.id];
            const activeEp = env.activeEndpointId
              ? env.endpoints.find((e) => e.id === env.activeEndpointId)
              : env.endpoints[0];
            const fleetItem = fleetStatus?.[env.id];
            const isUnread = unreadEnvs?.has(env.id) ?? false;
            const isMuted = mutedEnvs?.has(env.id) ?? false;
            const showPill = fleetItem && fleetItem !== "idle";
            return (
            <div key={env.id}>
              <button
                className={`instance-item${env.id === selectedId ? " selected" : ""}`}
                onClick={() => onSelect(env.id)}
                title={healthTooltip(intl, h, cs)}
              >
                <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                  <span
                    className="dot"
                    style={{ background: HEALTH_COLORS[h] }}
                  />
                  <UnreadDot visible={isUnread} />
                </span>
                <span className="name">{env.name}</span>
                {showPill ? <StatusPill status={fleetItem!} size="sm" /> : null}
                {env.authState === "unauthenticated" ? (
                  <span className="stat" style={{ fontSize: 9, color: "var(--text-muted)", marginRight: 2, opacity: 0.7 }}>
                    {intl.formatMessage({ id: "sidebar.noAuth" })}
                  </span>
                ) : null}
                {env.authState === "blocked" ? (
                   <span className="stat" style={{ fontSize: 9, color: "var(--health-blocked)", marginRight: 2 }}>
                    {intl.formatMessage({ id: "sidebar.blocked" })}
                  </span>
                ) : null}
                {activeEp ? (
                  <span className="stat" style={{ fontSize: 10, color: "var(--text-muted)", marginRight: 2 }}>
                    {kindLabel(intl, activeEp.kind)}
                  </span>
                ) : null}
                {(() => {
                  const ocStatus = openCodeStatus?.[env.id];
                  if (!ocStatus || (!env.opencode && ocStatus.authState === "unknown")) return null;
                  return (
                    <span
                      className="stat"
                      style={{ fontSize: 10, color: OPENCODE_AUTH_COLORS[ocStatus.authState], marginRight: 2 }}
                      title={openCodeStatusLabel(intl, ocStatus)}
                    >
                      oc:{ocStatus.authState === "authenticated" ? intl.formatMessage({ id: "sidebar.ocOk" }) : ocStatus.authState === "unauthenticated" ? intl.formatMessage({ id: "sidebar.ocAuth" }) : intl.formatMessage({ id: "sidebar.ocUnknownShort" })}
                    </span>
                  );
                })()}
                {(h === "backoff" || h === "blocked") && onRetry ? (
                  <span
                    className="remove"
                    role="button"
                    title={intl.formatMessage({ id: "sidebar.retryConnection" })}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRetry(env.id);
                    }}
                  >
                    <RotateCw size={12} />
                  </span>
                ) : null}
                {onToggleMute ? (
                  <span
                    className="remove"
                    role="button"
                    title={isMuted ? intl.formatMessage({ id: "sidebar.unmuteNotifications" }) : intl.formatMessage({ id: "sidebar.muteNotifications" })}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleMute(env.id);
                    }}
                  >
                    {isMuted ? <BellOff size={12} /> : <Bell size={12} />}
                  </span>
                ) : null}
                <span
                   className="remove"
                   role="button"
                   title={intl.formatMessage({ id: "sidebar.removeEnvironment" })}
                   onClick={(e) => {
                     e.stopPropagation();
                     if (window.confirm(intl.formatMessage({ id: "sidebar.removeConfirm" }, { name: env.name }))) {
                       onRemove(env.id);
                     }
                   }}
                 >
                   <X size={12} />
                 </span>
                 {env.role === "main-vm" ? (
                    <span className="stat" style={{ fontSize: 9, color: "var(--accent-infra)", marginRight: 2, fontWeight: 600 }}>
                     {intl.formatMessage({ id: "sidebar.main" })}
                   </span>
                 ) : null}
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
                      title={epH?.lastError ? `${endpointLabel(intl, ep)} — ${translateMessage(intl, epH.lastError)}` : endpointLabel(intl, ep)}
                    >
                      <span
                        className="dot"
                        style={{
                          background: ep.id === env.activeEndpointId ? "var(--accent-blue)" : (epH ? (ENDPOINT_PHASE_COLORS[epH.phase] ?? "var(--text-muted)") : "var(--text-muted)"),
                          width: 6,
                          height: 6,
                        }}
                      />
                      <span className="name">{kindLabel(intl, ep.kind)}: {hostLabel(ep.url)}</span>
                      {epH && epH.failureCount > 0 ? (
                        <span className="stat" style={{ fontSize: 9, color: "var(--danger)", marginLeft: 4 }}>
                          {intl.formatMessage({ id: "sidebar.errorsCount" }, { count: epH.failureCount })}
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
        <span className="avatar">{intl.formatMessage({ id: "sidebar.orbionInitials" })}</span>
        <span>{intl.formatMessage({ id: "sidebar.orbion" })}</span>
      </div>
    </div>
  );
}
