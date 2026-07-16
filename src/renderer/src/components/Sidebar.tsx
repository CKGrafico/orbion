import { useIntl, type IntlShape } from "react-intl";
import type { ConnectionStatus, EndpointHealth } from "../../../shared/ipc";
import type { Environment, EnvironmentHealth, AccessEndpoint, OpenCodeConnectionStatus, OpenCodeAuthState } from "../types";
import type { FleetItemStatus } from "../fleet-status";
import { getPillLabel } from "../fleet-status";
import { Terminal, RotateCw, X, Bell, BellOff } from "lucide-react";
import { UnreadDot } from "./StatusPill";
import { OrbionMark } from "./OrbionMark";
import { translateMessage } from "../i18n";

const HEALTH_COLORS: Record<EnvironmentHealth, string> = {
  ok: "var(--health-ok)",
  offline: "var(--health-offline)",
  unknown: "var(--health-unknown)",
  connecting: "var(--health-connecting)",
  backoff: "var(--health-backoff)",
  blocked: "var(--health-blocked)",
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
  const kind = ep.kind === "ssh" ? intl.formatMessage({ id: "sidebar.kindSsh" })
    : ep.kind === "tailscale" ? intl.formatMessage({ id: "sidebar.kindTailscale" })
    : intl.formatMessage({ id: "sidebar.kindDirect" });
  return `${kind}: ${ep.sshTarget ?? ep.url}`;
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
            const fleetItem = fleetStatus?.[env.id] ?? "idle";
            const isUnread = unreadEnvs?.has(env.id) ?? false;
            const isMuted = mutedEnvs?.has(env.id) ?? false;
            const isConnected = h === "ok";
            const ocStatus = openCodeStatus?.[env.id];
            const showOc = ocStatus && (env.opencode || ocStatus.authState !== "unknown");

            const statusLine = fleetItem !== "idle"
              ? getPillLabel(fleetItem)
              : cs?.phase === "backoff"
                ? intl.formatMessage({ id: "sidebar.retrying" }, { seconds: Math.round((cs.backoffMs ?? 0) / 1000), failures: cs.failureCount })
                : cs?.phase === "connecting"
                  ? intl.formatMessage({ id: "sidebar.connecting" })
                  : cs?.phase === "blocked"
                    ? (translateMessage(intl, cs.lastError) || intl.formatMessage({ id: "sidebar.blockedTooltip" }))
                    : null;

            return (
              <div key={env.id}>
                <button
                  className={`instance-item env-item${env.id === selectedId ? " selected" : ""}`}
                  onClick={() => onSelect(env.id)}
                  title={healthTooltip(intl, h, cs)}
                >
                  {/* Line 1: dot + name + badges */}
                  <div className="env-item-row1">
                    <span className="env-dot-wrap">
                      <span className="dot" style={{ background: HEALTH_COLORS[h] }} />
                      <UnreadDot visible={isUnread} />
                    </span>
                    <span className="env-name">{env.name}</span>
                    {env.role === "main-vm" ? (
                      <span className="env-badge env-badge-main">{intl.formatMessage({ id: "sidebar.main" })}</span>
                    ) : null}

                    {/* Badges — visible on hover */}
                    <div className="env-badges">
                      {activeEp?.kind === "ssh" ? (
                        <span className="env-badge" title={intl.formatMessage({ id: "sidebar.badgeSsh" })}>SSH</span>
                      ) : null}
                      <span
                        className={`env-badge ${isConnected ? "env-badge-ok" : "env-badge-off"}`}
                        title={intl.formatMessage({ id: isConnected ? "sidebar.badgeDaemon" : "sidebar.badgeDaemonOff" })}
                      >
                        Daemon
                      </span>
                      {showOc ? (
                        <>
                          <span
                            className={`env-badge ${ocStatus.authState === "authenticated" ? "env-badge-ok" : "env-badge-off"}`}
                            title={openCodeStatusLabel(intl, ocStatus)}
                            style={{ color: OPENCODE_AUTH_COLORS[ocStatus.authState] }}
                          >
                            OC
                          </span>
                        </>
                      ) : null}
                    </div>

                    {/* Action buttons — on hover */}
                    <div className="env-actions">
                      {(h === "backoff" || h === "blocked") && onRetry ? (
                        <span className="remove" role="button" title={intl.formatMessage({ id: "sidebar.retryConnection" })}
                          onClick={(e) => { e.stopPropagation(); onRetry(env.id); }}>
                          <RotateCw size={11} />
                        </span>
                      ) : null}
                      {onToggleMute ? (
                        <span className="remove" role="button"
                          title={isMuted ? intl.formatMessage({ id: "sidebar.unmuteNotifications" }) : intl.formatMessage({ id: "sidebar.muteNotifications" })}
                          onClick={(e) => { e.stopPropagation(); onToggleMute(env.id); }}>
                          {isMuted ? <BellOff size={11} /> : <Bell size={11} />}
                        </span>
                      ) : null}
                      <span className="remove" role="button" title={intl.formatMessage({ id: "sidebar.removeEnvironment" })}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(intl.formatMessage({ id: "sidebar.removeConfirm" }, { name: env.name }))) {
                            onRemove(env.id);
                          }
                        }}>
                        <X size={11} />
                      </span>
                    </div>
                  </div>

                  {/* Line 2: status / last activity */}
                  {statusLine ? (
                    <div className="env-item-row2">{statusLine}</div>
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
                          onClick={(e) => { e.stopPropagation(); onSetEndpoint?.(env.id, ep.id); }}
                          title={epH?.lastError ? `${endpointLabel(intl, ep)} — ${translateMessage(intl, epH.lastError)}` : endpointLabel(intl, ep)}
                        >
                          <span className="dot" style={{
                            background: ep.id === env.activeEndpointId ? "var(--accent-blue)"
                              : (epH ? (({ connected: "var(--endpoint-connected)", backoff: "var(--endpoint-backoff)", offline: "var(--endpoint-offline)" } as Record<string, string>)[epH.phase] ?? "var(--text-muted)") : "var(--text-muted)"),
                            width: 6, height: 6,
                          }} />
                          <span className="name">{endpointLabel(intl, ep)}</span>
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
        <OrbionMark size={24} />
        <span>{intl.formatMessage({ id: "sidebar.orbion" })}</span>
      </div>
    </div>
  );
}
