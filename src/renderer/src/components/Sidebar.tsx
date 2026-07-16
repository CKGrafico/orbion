import { useState, useCallback } from "react";
import { useIntl, type IntlShape } from "react-intl";
import type { ConnectionStatus, EndpointHealth } from "../../../shared/ipc";
import type { Environment, EnvironmentHealth, OpenCodeConnectionStatus, LoopMeta, Project } from "../types";
import type { FleetItemStatus } from "../fleet-status";
import { getPillLabel, PILL_COLORS } from "../fleet-status";
import { loopStatusToFleetItem } from "../fleet-mapping";
import { RotateCw, X, Bell, BellOff, Plus, ChevronRight } from "lucide-react";
import { UnreadDot } from "./StatusPill";
import { OrbionMark } from "./OrbionMark";
import { translateMessage } from "../i18n";

type View =
  | { kind: "instance" }
  | { kind: "project"; projectId: string }
  | { kind: "loop"; loopId: string };

const HEALTH_COLORS: Record<EnvironmentHealth, string> = {
  ok: "var(--health-ok)",
  offline: "var(--health-offline)",
  unknown: "var(--health-unknown)",
  connecting: "var(--health-connecting)",
  backoff: "var(--health-backoff)",
  blocked: "var(--health-blocked)",
};

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

interface TreeNodeChevronProps {
  expanded: boolean;
  hasChildren: boolean;
  onClick: (e: React.MouseEvent) => void;
}

function TreeNodeChevron({ expanded, hasChildren, onClick }: TreeNodeChevronProps): React.ReactNode {
  if (!hasChildren) {
    return <span className="tree-chevron placeholder"><ChevronRight size={10} /></span>;
  }
  return (
    <span
      className={`tree-chevron${expanded ? " expanded" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <ChevronRight size={10} />
    </span>
  );
}

interface LoopStatusDotProps {
  status: LoopMeta["status"];
  lastExitCode: number | null;
}

function LoopStatusDot({ status, lastExitCode }: LoopStatusDotProps): React.ReactNode {
  const fleetItem = loopStatusToFleetItem(status, lastExitCode);
  const color = PILL_COLORS[fleetItem];
  return <span className="tree-dot" style={{ background: color }} />;
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
  perEnvLoops: Record<string, LoopMeta[]>;
  perEnvProjects: Record<string, Project[]>;
  view: View;
  onToggleMute?: (environmentId: string) => void;
  onSelect: (id: string) => void;
  onNavigate: (view: View) => void;
  onAddVm?: () => void;
  onRemove: (id: string) => void;
  onRetry?: (id: string) => void;
  onSetEndpoint?: (environmentId: string, endpointId: string) => void;
}): React.ReactNode {
  const {
    environments, selectedId, health, connectionStatus, endpointHealth,
    fleetStatus, unreadEnvs, mutedEnvs, onToggleMute,
    onSelect, onAddVm, onRemove, onRetry, onSetEndpoint,
    perEnvLoops, perEnvProjects, view, onNavigate,
  } = props;
  const intl = useIntl();
  const [filterId, setFilterId] = useState<string>("");

  // Track which instance and project nodes are expanded
  const [expandedInstances, setExpandedInstances] = useState<Set<string>>(new Set());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  const visibleEnvs = filterId ? environments.filter((e) => e.id === filterId) : environments;

  const toggleInstance = useCallback((id: string) => {
    setExpandedInstances((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleProject = useCallback((id: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Auto-expand the selected instance
  const isInstanceExpanded = (id: string): boolean => {
    if (id === selectedId) return true;
    return expandedInstances.has(id);
  };

  return (
    <div className="sidebar">
      <div className="sidebar-top">
        <select
          className="sidebar-filter"
          value={filterId}
          onChange={(e) => setFilterId(e.target.value)}
        >
          <option value="">{intl.formatMessage({ id: "sidebar.allEnvironments" })}</option>
          {environments.map((env) => (
            <option key={env.id} value={env.id}>{env.name}</option>
          ))}
        </select>
        <button className="sidebar-add" title={intl.formatMessage({ id: "sidebar.addEnvironment" })} onClick={onAddVm}>
          <Plus size={14} />
        </button>
      </div>

      <div className="sidebar-section">
        <span className="overline">{intl.formatMessage({ id: "sidebar.environments" })}</span>
        <span className="overline">{visibleEnvs.length || ""}</span>
      </div>

      <div className="sidebar-list">
        {visibleEnvs.length === 0 ? (
          <div style={{ padding: "6px 10px", fontSize: 12.5, color: "var(--text-muted)" }}>
            {intl.formatMessage({ id: "sidebar.noEnvironments" })}
          </div>
        ) : (
          visibleEnvs.map((env) => {
            const h = health[env.id] ?? "unknown";
            const cs = connectionStatus?.[env.id];
            const fleetItem = fleetStatus?.[env.id] ?? "idle";
            const isUnread = unreadEnvs?.has(env.id) ?? false;
            const isMuted = mutedEnvs?.has(env.id) ?? false;
            const instanceExpanded = isInstanceExpanded(env.id);
            const isSelected = env.id === selectedId;

            const envLoops = perEnvLoops[env.id] ?? [];
            const envProjects = perEnvProjects[env.id] ?? [];

            // Group loops by projectId
            const loopsByProject = new Map<string, LoopMeta[]>();
            const unassignedLoops: LoopMeta[] = [];
            for (const loop of envLoops) {
              const pid = loop.projectId ?? "default";
              if (pid === "default" || !envProjects.some((p) => p.id === pid)) {
                unassignedLoops.push(loop);
              } else {
                const existing = loopsByProject.get(pid) ?? [];
                existing.push(loop);
                loopsByProject.set(pid, existing);
              }
            }

            const hasChildren = envLoops.length > 0 || envProjects.length > 0;
            const instanceViewMatch = isSelected && view.kind === "instance";

            return (
              <div key={env.id}>
                {/* Instance node (level 0) */}
                <div
                  className={`tree-node tree-node-depth-0${isSelected ? " selected" : ""}${instanceViewMatch ? " selected" : ""}`}
                  onClick={() => {
                    onSelect(env.id);
                    onNavigate({ kind: "instance" });
                  }}
                  title={healthTooltip(intl, h, cs)}
                >
                  <TreeNodeChevron
                    expanded={instanceExpanded}
                    hasChildren={hasChildren}
                    onClick={(e) => { e.stopPropagation(); toggleInstance(env.id); }}
                  />
                  <span className="env-dot-wrap">
                    <span className="tree-dot" style={{ background: HEALTH_COLORS[h] }} />
                    <UnreadDot visible={isUnread} />
                  </span>
                  <span className="tree-label">{env.name}</span>

                  {/* Fleet status pill */}
                  {fleetItem !== "idle" ? (
                    <span
                      className="tree-pill"
                      style={{
                        background: `${PILL_COLORS[fleetItem]}22`,
                        color: PILL_COLORS[fleetItem],
                      }}
                    >
                      {getPillLabel(fleetItem)}
                    </span>
                  ) : null}

                  {env.role === "main-vm" ? (
                    <span className="tree-pill" style={{ background: "color-mix(in srgb, var(--accent-infra) 15%, transparent)", color: "var(--accent-infra)" }}>
                      {intl.formatMessage({ id: "sidebar.main" })}
                    </span>
                  ) : null}

                  {/* Action buttons on hover */}
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

                {/* Expanded instance: project and loop children */}
                {instanceExpanded ? (
                  <div className="tree-children">
                    {/* Project nodes (level 1) */}
                    {envProjects.map((project) => {
                      const projectLoops = loopsByProject.get(project.id) ?? [];
                      const projectExpanded = expandedProjects.has(project.id);
                      const projectViewMatch = isSelected && view.kind === "project" && view.projectId === project.id;

                      return (
                        <div key={project.id}>
                          <div
                            className={`tree-node tree-node-depth-1${projectViewMatch ? " selected" : ""}`}
                            onClick={() => {
                              onSelect(env.id);
                              onNavigate({ kind: "project", projectId: project.id });
                            }}
                          >
                            <TreeNodeChevron
                              expanded={projectExpanded}
                              hasChildren={projectLoops.length > 0}
                              onClick={(e) => { e.stopPropagation(); toggleProject(project.id); }}
                            />
                            <span className="tree-dot" style={{ background: project.color }} />
                            <span className="tree-label">{project.name}</span>
                            <span className="tree-pill" style={{ background: "var(--bg-input)", color: "var(--text-muted)" }}>
                              {projectLoops.length}
                            </span>
                          </div>

                          {/* Loop children (level 2) */}
                          {projectExpanded ? (
                            <div className="tree-project-children">
                              {projectLoops.map((loop) => {
                                const loopViewMatch = isSelected && view.kind === "loop" && view.loopId === loop.id;
                                const loopTitle = loop.description?.trim() || loop.id;
                                return (
                                  <div
                                    key={loop.id}
                                    className={`tree-node tree-node-depth-2${loopViewMatch ? " selected" : ""}`}
                                    onClick={() => {
                                      onSelect(env.id);
                                      onNavigate({ kind: "loop", loopId: loop.id });
                                    }}
                                  >
                                    <span className="tree-chevron placeholder"><ChevronRight size={10} /></span>
                                    <LoopStatusDot status={loop.status} lastExitCode={loop.lastExitCode} />
                                    <span className="tree-label">{loopTitle}</span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}

                    {/* Unassigned loops (no project) */}
                    {unassignedLoops.length > 0 ? (
                      <div className="tree-project-children">
                        {unassignedLoops.map((loop) => {
                          const loopViewMatch = isSelected && view.kind === "loop" && view.loopId === loop.id;
                          const loopTitle = loop.description?.trim() || loop.id;
                          return (
                            <div
                              key={loop.id}
                              className={`tree-node tree-node-depth-2${loopViewMatch ? " selected" : ""}`}
                              onClick={() => {
                                onSelect(env.id);
                                onNavigate({ kind: "loop", loopId: loop.id });
                              }}
                            >
                              <span className="tree-chevron placeholder"><ChevronRight size={10} /></span>
                              <LoopStatusDot status={loop.status} lastExitCode={loop.lastExitCode} />
                              <span className="tree-label">{loopTitle}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    {/* Endpoints (multi-endpoint environments) */}
                    {env.endpoints.length > 1 && isSelected ? (
                      <div style={{ paddingLeft: 14 }}>
                        {env.endpoints.map((ep) => {
                          const epH = endpointHealth?.[env.id]?.find((eh) => eh.endpointId === ep.id);
                          const epLabel = ep.kind === "ssh"
                            ? intl.formatMessage({ id: "sidebar.kindSsh" })
                            : ep.kind === "tailscale"
                              ? intl.formatMessage({ id: "sidebar.kindTailscale" })
                              : intl.formatMessage({ id: "sidebar.kindDirect" });
                          return (
                            <button
                              key={ep.id}
                              className={`instance-item${ep.id === env.activeEndpointId ? " selected" : ""}`}
                              style={{ fontSize: 11, opacity: ep.id === env.activeEndpointId ? 1 : 0.6, padding: "3px 10px" }}
                              onClick={(e) => { e.stopPropagation(); onSetEndpoint?.(env.id, ep.id); }}
                              title={epH?.lastError ? `${epLabel}, ${translateMessage(intl, epH.lastError)}` : epLabel}
                            >
                              <span className="dot" style={{
                                background: ep.id === env.activeEndpointId ? "var(--accent-blue)"
                                  : (epH ? (({ connected: "var(--endpoint-connected)", backoff: "var(--endpoint-backoff)", offline: "var(--endpoint-offline)" } as Record<string, string>)[epH.phase] ?? "var(--text-muted)") : "var(--text-muted)"),
                                width: 6, height: 6,
                              }} />
                              <span className="name">{epLabel}</span>
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
