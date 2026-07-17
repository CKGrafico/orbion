import { useState, useCallback, useMemo } from "react";
import { useIntl, type IntlShape } from "react-intl";
import type { ConnectionStatus } from "../../../shared/ipc";
import type { Environment, EnvironmentHealth, LoopMeta, Project } from "../types";
import { getPillLabel, PILL_COLORS } from "../fleet-status";
import { loopStatusToFleetItem } from "../fleet-mapping";
import { X, Plus, ChevronRight, Search, ArrowUpDown, Link, Inbox } from "lucide-react";
import { OrbionMark } from "./OrbionMark";
import { FleetActivityReadout } from "./FleetActivityReadout";
import { FleetHealthFooter } from "./FleetHealthFooter";
import { translateMessage } from "../i18n";

type View =
  | { kind: "inbox" }
  | { kind: "instance" }
  | { kind: "project"; projectId: string }
  | { kind: "loop"; loopId: string };

/** Composite key for a Project(instance) pair — unique across environments */
function projectInstanceKey(projectId: string, envId: string): string {
  return `${envId}::${projectId}`;
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

/** Check whether a project-instance node has any failed loops on a reachable instance. */
function projectHasFailedLoop(
  loops: LoopMeta[],
  envId: string,
  health: Record<string, EnvironmentHealth>,
): boolean {
  const h = health[envId] ?? "unknown";
  // Unreachable instances (offline, blocked, unknown) must NOT trigger the pip
  if (h !== "ok" && h !== "connecting" && h !== "backoff") return false;
  return loops.some((loop) => loopStatusToFleetItem(loop.status, loop.lastExitCode) === "failed");
}

/** A flattened project-instance node for the 2-level tree */
interface ProjectInstanceNode {
  key: string;          // composite key: `${envId}::${projectId}`
  projectId: string;
  projectName: string;
  projectColor: string;
  envId: string;
  envName: string;
  loops: LoopMeta[];
}

export function Sidebar(props: {
  environments: Environment[];
  selectedId: string | null;
  health: Record<string, EnvironmentHealth>;
  connectionStatus?: Record<string, ConnectionStatus>;
  perEnvLoops: Record<string, LoopMeta[]>;
  perEnvProjects: Record<string, Project[]>;
  view: View;
  onSelect: (id: string) => void;
  onNavigate: (view: View) => void;
  onAddVm?: () => void;
  fleetActivityEnabled?: boolean;
  /** Number of unread inbox items (drives the badge). */
  inboxItemCount?: number;
  /** Navigate to a specific loop (env + loopId). */
  onNavigateToLoop?: (envId: string, loopId: string) => void;
  /** Navigate to a specific project (env + projectId). */
  onNavigateToProject?: (envId: string, projectId: string) => void;
  /** Navigate to the inbox view. */
  onNavigateToInbox?: () => void;
}): React.ReactNode {
  const {
    environments, selectedId, health, connectionStatus,
    perEnvLoops, perEnvProjects, view, onNavigate,
    onSelect, onAddVm, fleetActivityEnabled, inboxItemCount,
    onNavigateToLoop, onNavigateToProject, onNavigateToInbox,
  } = props;
  const intl = useIntl();

  // Text search filter
  const [searchQuery, setSearchQuery] = useState("");

  // Track which project-instance nodes are expanded
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  // Whether there's more than one environment (controls instance badge visibility)
  const hasMultipleEnvs = environments.length > 1;

  // Build flattened Project(instance) node list
  const projectNodes = useMemo<ProjectInstanceNode[]>(() => {
    const nodes: ProjectInstanceNode[] = [];
    for (const env of environments) {
      const envProjects = perEnvProjects[env.id] ?? [];
      const envLoops = perEnvLoops[env.id] ?? [];

      // Group loops by projectId
      const loopsByProject = new Map<string, LoopMeta[]>();
      for (const loop of envLoops) {
        const pid = loop.projectId ?? "default";
        const existing = loopsByProject.get(pid) ?? [];
        existing.push(loop);
        loopsByProject.set(pid, existing);
      }

      for (const project of envProjects) {
        const projectLoops = loopsByProject.get(project.id) ?? [];
        nodes.push({
          key: projectInstanceKey(project.id, env.id),
          projectId: project.id,
          projectName: project.name,
          projectColor: project.color,
          envId: env.id,
          envName: env.name,
          loops: projectLoops,
        });
      }

      // Also include "default" (unassigned) loops as a virtual project under each env
      const unassignedLoops = loopsByProject.get("default") ?? envLoops.filter(
        (l) => !l.projectId || !envProjects.some((p) => p.id === l.projectId)
      );
      if (unassignedLoops.length > 0) {
        // Check if a "default" project exists; if not, create a virtual one
        const hasDefaultProject = envProjects.some((p) => p.id === "default");
        if (!hasDefaultProject) {
          nodes.push({
            key: projectInstanceKey("default", env.id),
            projectId: "default",
            projectName: "Default",
            projectColor: PILL_COLORS["idle"],
            envId: env.id,
            envName: env.name,
            loops: unassignedLoops,
          });
        }
      }
    }
    return nodes;
  }, [environments, perEnvProjects, perEnvLoops]);

  // Filter by search query
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return projectNodes;
    const q = searchQuery.toLowerCase();
    return projectNodes.filter((node) => {
      // Match project name, instance name, or any loop description
      if (node.projectName.toLowerCase().includes(q)) return true;
      if (node.envName.toLowerCase().includes(q)) return true;
      if (node.loops.some((l) => (l.description || l.id).toLowerCase().includes(q))) return true;
      return false;
    });
  }, [projectNodes, searchQuery]);

  const toggleProject = useCallback((key: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Determine which environment is "selected" for a given project node
  // When clicking a project or loop, we select the environment it belongs to
  const isProjectSelected = (node: ProjectInstanceNode): boolean => {
    if (node.envId !== selectedId) return false;
    if (view.kind === "project" && view.projectId === node.projectId) return true;
    // Also selected if any child loop is the active loop view
    if (view.kind === "loop" && node.loops.some((l) => l.id === view.loopId)) return true;
    return false;
  };

  const isLoopSelected = (loopId: string): boolean => {
    return view.kind === "loop" && view.loopId === loopId;
  };

  // Total visible project count
  const totalProjects = filteredNodes.length;

  return (
    <div className="sidebar">
      {/* Inbox entry — fleet-wide, above projects */}
      <div
        className={`sidebar-inbox-entry${view.kind === "inbox" ? " selected" : ""}`}
        onClick={() => onNavigate({ kind: "inbox" })}
        role="button"
        tabIndex={0}
      >
        <span className="sidebar-inbox-icon"><Inbox size={14} /></span>
        <span className="sidebar-inbox-label">{intl.formatMessage({ id: "sidebar.inbox" })}</span>
        {(inboxItemCount ?? 0) > 0 ? (
          <span className="sidebar-inbox-badge">{inboxItemCount}</span>
        ) : null}
      </div>

      <div className="sidebar-divider" />

      {/* Search input */}
      <div className="sidebar-search-wrap">
        <Search size={13} className="sidebar-search-icon" />
        <input
          className="sidebar-search"
          type="text"
          placeholder={intl.formatMessage({ id: "sidebar.searchPlaceholder" })}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery ? (
          <button
            className="sidebar-search-clear"
            onClick={() => setSearchQuery("")}
          >
            <X size={12} />
          </button>
        ) : null}
      </div>

      {/* Toolbar: section label + action buttons */}
      <div className="sidebar-toolbar">
        <span className="overline">{intl.formatMessage({ id: "sidebar.projects" })}</span>
        <span className="overline sidebar-count">{totalProjects || ""}</span>
        <span style={{ flex: 1 }} />
        <button
          className="sidebar-toolbar-btn"
          title={intl.formatMessage({ id: "sidebar.sort" })}
        >
          <ArrowUpDown size={13} />
        </button>
        <button
          className="sidebar-toolbar-btn"
          title={intl.formatMessage({ id: "sidebar.connectInstance" })}
          onClick={onAddVm}
        >
          <Link size={13} />
        </button>
        <button
          className="sidebar-toolbar-btn"
          title={intl.formatMessage({ id: "sidebar.newProject" })}
        >
          <Plus size={13} />
        </button>
      </div>

      {/* 2-level tree: Project(instance) > Loop */}
      <div className="sidebar-list">
        {filteredNodes.length === 0 ? (
          <div className="sidebar-empty">
            {searchQuery
              ? intl.formatMessage({ id: "sidebar.noSearchResults" })
              : intl.formatMessage({ id: "sidebar.noProjects" })}
          </div>
        ) : (
          filteredNodes.map((node) => {
            const projectExpanded = expandedProjects.has(node.key);
            const projectSelected = isProjectSelected(node);
            const hasChildren = node.loops.length > 0;

            const h = health[node.envId] ?? "unknown";
            const cs = connectionStatus?.[node.envId];

            return (
              <div key={node.key}>
                {/* Project node (level 0) */}
                <div
                  className={`tree-node tree-node-depth-0${projectSelected ? " selected" : ""}`}
                  onClick={() => {
                    onSelect(node.envId);
                    onNavigate({ kind: "project", projectId: node.projectId });
                  }}
                  title={healthTooltip(intl, h, cs)}
                >
                  <TreeNodeChevron
                    expanded={projectExpanded}
                    hasChildren={hasChildren}
                    onClick={(e) => { e.stopPropagation(); toggleProject(node.key); }}
                  />
                  <span className="tree-dot-wrap">
                    <span className="tree-dot" style={{ background: node.projectColor }} />
                    {projectHasFailedLoop(node.loops, node.envId, health) ? (
                      <span className="tree-dot-pip" title={intl.formatMessage({ id: "sidebar.projectHasFailure" })} />
                    ) : null}
                  </span>
                  <span className="tree-label">{node.projectName}</span>
                  {hasMultipleEnvs ? (
                    <span className="tree-instance-badge">{node.envName}</span>
                  ) : null}
                  <span className="tree-pill" style={{ background: "var(--bg-input)", color: "var(--text-muted)" }}>
                    {node.loops.length}
                  </span>
                </div>

                {/* Loop children (level 1) */}
                {projectExpanded ? (
                  <div className="tree-children">
                    {node.loops.map((loop) => {
                      const loopSelected = isLoopSelected(loop.id);
                      const loopTitle = loop.description?.trim() || loop.id;
                      const fleetItem = loopStatusToFleetItem(loop.status, loop.lastExitCode);
                      const loopColor = PILL_COLORS[fleetItem];

                      return (
                        <div
                          key={loop.id}
                          className={`tree-node tree-node-depth-1${loopSelected ? " selected" : ""}`}
                          onClick={() => {
                            onSelect(node.envId);
                            onNavigate({ kind: "loop", loopId: loop.id });
                          }}
                        >
                          <span className="tree-chevron placeholder"><ChevronRight size={10} /></span>
                          <LoopStatusDot status={loop.status} lastExitCode={loop.lastExitCode} />
                          <span className="tree-label">{loopTitle}</span>
                          <span
                            className="tree-loop-status"
                            style={{ color: loopColor }}
                            title={getPillLabel(fleetItem)}
                          >
                            {getPillLabel(fleetItem)}
                          </span>
                          <span className="tree-loop-runcount">
                            {loop.runCount > 0 ? `${loop.runCount}r` : ""}
                          </span>
                        </div>
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
        <FleetHealthFooter
          environments={environments}
          health={health}
          perEnvLoops={perEnvLoops}
          onNavigateToLoop={(envId, loopId) => {
            onSelect(envId);
            onNavigateToLoop?.(envId, loopId);
          }}
          onNavigateToProject={(envId, projectId) => {
            onSelect(envId);
            onNavigateToProject?.(envId, projectId);
          }}
          onNavigateToInbox={() => {
            onNavigateToInbox?.();
          }}
          onSelectEnvironment={(envId) => {
            onSelect(envId);
          }}
        />
        {fleetActivityEnabled !== false ? (
          <FleetActivityReadout
            perEnvLoops={perEnvLoops}
            perEnvHealth={health}
            environments={environments}
          />
        ) : null}
        <span style={{ flex: 1 }} />
        <OrbionMark size={24} />
        <span>{intl.formatMessage({ id: "sidebar.orbion" })}</span>
      </div>
    </div>
  );
}
