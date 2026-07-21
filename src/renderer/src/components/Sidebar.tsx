import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useIntl } from "react-intl";
import type { ChatSession, ConnectionStatus, ReachabilityState } from "../../../shared/ipc";
import type { Environment, EnvironmentHealth, LoopMeta, Project } from "../types";
import { getPillLabel, PILL_COLORS } from "../fleet-status";
import { loopStatusToFleetItem } from "../fleet-mapping";
import { X, Plus, ChevronRight, Search, ArrowUpDown, Link, Inbox, MessageSquare, Settings } from "lucide-react";
import { OrbionMark } from "./OrbionMark";
import { FleetActivityReadout } from "./FleetActivityReadout";
import { FleetHealthFooter } from "./FleetHealthFooter";
import { timeAgo, healthTooltip } from "../format";
import { cid, useInject } from "inversify-hooks";
import type { IConfigService } from "../services/interfaces";

type View =
  | { kind: "inbox" }
  | { kind: "instance" }
  | { kind: "project"; projectId: string }
  | { kind: "loop"; loopId: string }
  | { kind: "session"; sessionId: string };

/** Key for a merged project node — deduped by project name */
function mergedProjectKey(projectName: string): string {
  return `merged:${projectName}`;
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
  /** When the instance is unreachable/reconnecting, loops render as unknown (greyed). */
  reachability?: ReachabilityState;
}

function LoopStatusDot({ status, lastExitCode, reachability }: LoopStatusDotProps): React.ReactNode {
  const fleetItem = loopStatusToFleetItem(status, lastExitCode, reachability);
  const color = PILL_COLORS[fleetItem];
  return <span className="tree-dot" style={{ background: color }} />;
}

/** Check whether a project-instance node has any failed loops on a reachable instance. */
function projectHasFailedLoop(
  loops: LoopMeta[],
  envId: string,
  health: Record<string, EnvironmentHealth>,
  reachability?: Record<string, ReachabilityState>,
): boolean {
  const h = health[envId] ?? "unknown";
  const r = reachability?.[envId];
  // Unreachable/reconnecting instances must NOT trigger the pip — their loops
  // are "unknown", not "failed"
  if (r === "unreachable" || r === "reconnecting") return false;
  if (h !== "ok" && h !== "connecting" && h !== "backoff") return false;
  return loops.some((loop) => loopStatusToFleetItem(loop.status, loop.lastExitCode, r) === "failed");
}

/** One instance's contribution to a merged project */
interface ProjectInstanceSlice {
  envId: string;
  envName: string;
  projectId: string;
  loops: LoopMeta[];
}

/** A merged project node — one entry per project NAME across all instances */
interface MergedProjectNode {
  key: string;             // `merged:${projectName}`
  projectName: string;
  projectColor: string;
  instances: ProjectInstanceSlice[];
  /** All loops from every instance, concatenated */
  allLoops: LoopMeta[];
}

export function Sidebar(props: {
  environments: Environment[];
  selectedId: string | null;
  health: Record<string, EnvironmentHealth>;
  connectionStatus?: Record<string, ConnectionStatus>;
  perEnvLoops: Record<string, LoopMeta[]>;
  perEnvProjects: Record<string, Project[]>;
  view: View;
  /** Per-environment reachability state (its own health layer, separate from loop status). */
  reachability?: Record<string, ReachabilityState>;
  /** ID of the main-VM environment — used to prefer its project color when instances disagree. */
  mainVmId?: string | null;
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
  /** Navigate to a specific chat session. */
  onNavigateToSession?: (sessionId: string) => void;
  /** The currently active session id, if any. */
  activeSessionId?: string | null;
  /** Open or create a chat session for a project on a specific instance. */
  onOpenProjectChat?: (projectName: string, environmentId: string, workingDirectory: string) => void;
  /** Chat sessions — passed from parent so sidebar stays in sync with persist/unpersist changes. */
  sessions?: ChatSession[];
  /** Move a chat session to a different project (re-files it in the sidebar). */
  onMoveSessionToProject?: (sessionId: string, targetProjectName: string) => void;
  /** Open the global settings panel. */
  onOpenSettings?: () => void;
}): React.ReactNode {
  const {
    environments, selectedId, health, connectionStatus,
    perEnvLoops, perEnvProjects, view, onNavigate,
    onSelect, onAddVm, fleetActivityEnabled, inboxItemCount,
    onNavigateToLoop, onNavigateToProject, onNavigateToInbox,
    reachability, mainVmId,     onNavigateToSession, activeSessionId, onOpenProjectChat, sessions: propSessions, onMoveSessionToProject, onOpenSettings,
  } = props;
  const intl = useIntl();
  const [configService] = useInject<IConfigService>(cid.IConfigService);

  // Text search filter
  const [searchQuery, setSearchQuery] = useState("");

  // Context menu for moving sessions between projects
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    sessionId: string;
    currentProjectName: string;
  } | null>(null);

  // Track which project nodes are expanded — persisted across restarts
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const expandedPersisted = useRef(false);

  // Load expanded project state from config store on mount
  useEffect(() => {
    if (expandedPersisted.current) return;
    expandedPersisted.current = true;
    void configService.getExpandedProjects().then((keys) => {
      if (keys.length > 0) {
        setExpandedProjects(new Set(keys));
      }
    });
  }, [configService]);

  // Close context menu on click outside or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (): void => setContextMenu(null);
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [contextMenu]);

  // Chat sessions — prefer prop sessions (stays in sync with persist/unpersist),
  // fall back to loading from config store
  const [localSessions, setLocalSessions] = useState<ChatSession[]>([]);
  const sessions = propSessions ?? localSessions;
  const sessionsLoaded = useRef(false);

  useEffect(() => {
    if (propSessions) return; // Prop-driven, no need to load locally
    if (sessionsLoaded.current) return;
    sessionsLoaded.current = true;
    void configService.getChatSessions().then((s) => {
      setLocalSessions(s);
    });
  }, [configService, propSessions]);

  // Build merged project node list — one entry per project NAME across all instances.
  // Same-name projects on different instances merge into a single sidebar row.
  const projectNodes = useMemo<MergedProjectNode[]>(() => {
    // Phase 1: collect per-instance project data
    const envProjectData: Array<{
      envId: string;
      envName: string;
      project: Project;
      loops: LoopMeta[];
    }> = [];

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
        envProjectData.push({ envId: env.id, envName: env.name, project, loops: projectLoops });
      }

      // Also include "default" (unassigned) loops as a virtual project under each env
      const unassignedLoops = loopsByProject.get("default") ?? envLoops.filter(
        (l) => !l.projectId || !envProjects.some((p) => p.id === l.projectId)
      );
      if (unassignedLoops.length > 0) {
        const hasDefaultProject = envProjects.some((p) => p.id === "default");
        if (!hasDefaultProject) {
          envProjectData.push({
            envId: env.id,
            envName: env.name,
            project: { id: "default", name: "Default", color: PILL_COLORS["idle"], createdAt: new Date().toISOString() },
            loops: unassignedLoops,
          });
        }
      }
    }

    // Phase 2: merge by project name
    const byName = new Map<string, MergedProjectNode>();
    // Track the color from the main-VM instance per project name so we can
    // prefer it deterministically when instances disagree.
    const mainVmColor = new Map<string, string>();
    for (const entry of envProjectData) {
      const name = entry.project.name;
      if (entry.envId === mainVmId && !mainVmColor.has(name)) {
        mainVmColor.set(name, entry.project.color);
      }
    }
    for (const entry of envProjectData) {
      const name = entry.project.name;
      let node = byName.get(name);
      if (!node) {
        // Prefer the main-VM's color; fall back to the first instance's color.
        const color = mainVmColor.get(name) ?? entry.project.color;
        node = {
          key: mergedProjectKey(name),
          projectName: name,
          projectColor: color,
          instances: [],
          allLoops: [],
        };
        byName.set(name, node);
      }
      node.instances.push({
        envId: entry.envId,
        envName: entry.envName,
        projectId: entry.project.id,
        loops: entry.loops,
      });
      node.allLoops = [...node.allLoops, ...entry.loops];
    }

    return [...byName.values()];
  }, [environments, perEnvProjects, perEnvLoops, mainVmId]);

  // Group sessions by project name — only persisted sessions appear in the sidebar
  const sessionsByProject = useMemo(() => {
    const map = new Map<string, ChatSession[]>();
    for (const session of sessions) {
      // Ephemeral (scratch) sessions are not listed in the sidebar
      if (!session.persisted) continue;
      const existing = map.get(session.projectName) ?? [];
      existing.push(session);
      map.set(session.projectName, existing);
    }
    // Sort sessions within each project by lastActiveAt (newest first)
    for (const [key, list] of map) {
      list.sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime());
      map.set(key, list);
    }
    return map;
  }, [sessions]);

  // Filter by search query
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return projectNodes;
    const q = searchQuery.toLowerCase();
    return projectNodes.filter((node) => {
      // Match project name, instance name, or any loop description, or session title
      if (node.projectName.toLowerCase().includes(q)) return true;
      if (node.instances.some((inst) => inst.envName.toLowerCase().includes(q))) return true;
      if (node.allLoops.some((l) => (l.description || l.id).toLowerCase().includes(q))) return true;
      const projSessions = sessionsByProject.get(node.projectName) ?? [];
      if (projSessions.some((s) => s.title.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [projectNodes, searchQuery, sessionsByProject]);

  const toggleProject = useCallback((key: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      // Persist expanded state to config store
      void configService.setExpandedProjects([...next]);
      return next;
    });
  }, [configService]);

  // Determine which environment is "selected" for a given merged project node.
  const isProjectSelected = (node: MergedProjectNode): boolean => {
    if (view.kind === "project") {
      return node.instances.some(
        (inst) => inst.envId === selectedId && inst.projectId === view.projectId,
      );
    }
    if (view.kind === "loop") {
      return node.allLoops.some(
        (l) => l.id === view.loopId && node.instances.some((inst) => inst.envId === selectedId && inst.loops.some((il) => il.id === l.id)),
      );
    }
    // Also selected if any child session is active (includes ephemeral sessions)
    if (view.kind === "session") {
      // Check both persisted (listed) and ephemeral sessions so the project
      // node highlights even when the active session is scratch/unsaved.
      const activeSession = sessions.find((s) => s.id === activeSessionId);
      return !!activeSession && activeSession.projectName === node.projectName;
    }
    return false;
  };

  const isLoopSelected = (loopId: string): boolean => {
    return view.kind === "loop" && view.loopId === loopId;
  };

  const isSessionSelected = (sessionId: string): boolean => {
    return view.kind === "session" && sessionId === activeSessionId;
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

      {/* 2-level tree: Merged project > Sessions (and optionally loops) */}
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
            const projSessions = sessionsByProject.get(node.projectName) ?? [];
            const hasChildren = projSessions.length > 0 || node.allLoops.length > 0;
            const instanceCount = node.instances.length;

            // Pick the primary instance for this merged project:
            // prefer the currently selected env if it has this project,
            // otherwise fall back to the first instance.
            const primaryInstance = node.instances.find((inst) => inst.envId === selectedId) ?? node.instances[0];
            const h = health[primaryInstance.envId] ?? "unknown";
            const cs = connectionStatus?.[primaryInstance.envId];

            // Check for failed loops across ALL instances in this merged project
            const hasFailedLoop = node.instances.some((inst) =>
              projectHasFailedLoop(inst.loops, inst.envId, health, reachability),
            );

            return (
              <div key={node.key}>
                {/* Project node (level 0) */}
                <div
                  className={`tree-node tree-node-depth-0${projectSelected ? " selected" : ""}`}
                  onClick={() => {
                    onSelect(primaryInstance.envId);
                    onNavigate({ kind: "project", projectId: primaryInstance.projectId });
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
                    {hasFailedLoop ? (
                      <span className="tree-dot-pip" title={intl.formatMessage({ id: "sidebar.projectHasFailure" })} />
                    ) : null}
                  </span>
                  <span className="tree-label">{node.projectName}</span>
                  {instanceCount > 1 ? (
                    <span className="tree-instance-badge" title={intl.formatMessage({ id: "sidebar.instanceCount" }, { count: instanceCount })}>
                      {instanceCount}
                    </span>
                  ) : null}
                  <span className="tree-pill" style={{ background: "var(--bg-input)", color: "var(--text-muted)" }} title={intl.formatMessage({ id: "sidebar.sessionCount" }, { count: projSessions.length })}>
                    {projSessions.length}
                  </span>
                  <button
                    className="tree-action-btn"
                    title={intl.formatMessage({ id: "sidebar.openProjectChat" })}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Derive workingDirectory from first loop's cwd in this project on the primary instance
                      const projectLoops = primaryInstance.loops;
                      const cwd = projectLoops.length > 0 ? projectLoops[0].cwd : `~/${node.projectName}`;
                      onOpenProjectChat?.(node.projectName, primaryInstance.envId, cwd);
                    }}
                  >
                    <MessageSquare size={12} />
                  </button>
                </div>

                {/* Session & loop children — rendered when expanded */}
                {projectExpanded ? (
                  <div className="tree-children">
                    {/* Chat sessions as indented rows */}
                    {projSessions.map((session) => {
                      const sessionSelected = isSessionSelected(session.id);
                      const sessionActive = session.id === activeSessionId;
                      const relativeTime = timeAgo(session.lastActiveAt);

                      return (
                        <div
                          key={session.id}
                          className={`tree-node tree-node-depth-1 tree-session-row${sessionSelected ? " selected" : ""}${sessionActive ? " active-session" : ""}`}
                          onClick={() => {
                            onNavigateToSession?.(session.id);
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setContextMenu({
                              x: e.clientX,
                              y: e.clientY,
                              sessionId: session.id,
                              currentProjectName: node.projectName,
                            });
                          }}
                          title={session.title}
                        >
                          <span className="tree-chevron placeholder"><ChevronRight size={10} /></span>
                          <span className="tree-session-icon">
                            <MessageSquare size={12} />
                          </span>
                          <span className="tree-label">{session.title}</span>
                          <span className="tree-session-time">{relativeTime}</span>
                          {sessionActive ? (
                            <span className="tree-session-active-dot" />
                          ) : null}
                        </div>
                      );
                    })}

                    {/* Loop children — shown below sessions when multi-instance */}
                    {instanceCount > 1 ? (
                      node.instances.map((inst) => {
                        if (inst.loops.length === 0) return null;
                        const instReachability = reachability?.[inst.envId];
                        return (
                          <div key={`inst-${inst.envId}`}>
                            <div className="tree-node tree-node-depth-1 tree-instance-group">
                              <span className="tree-chevron placeholder"><ChevronRight size={10} /></span>
                              <span className="tree-instance-label">{inst.envName}</span>
                            </div>
                            {inst.loops.map((loop) => {
                              const loopSelected = isLoopSelected(loop.id);
                              const loopTitle = loop.description?.trim() || loop.id;
                              const fleetItem = loopStatusToFleetItem(loop.status, loop.lastExitCode, instReachability);
                              const loopColor = PILL_COLORS[fleetItem];
                              const loopLabel = getPillLabel(fleetItem);

                              return (
                                <div
                                  key={loop.id}
                                  className={`tree-node tree-node-depth-2${loopSelected ? " selected" : ""}`}
                                  onClick={() => {
                                    onSelect(inst.envId);
                                    onNavigate({ kind: "loop", loopId: loop.id });
                                  }}
                                >
                                  <span className="tree-chevron placeholder"><ChevronRight size={10} /></span>
                                  <LoopStatusDot status={loop.status} lastExitCode={loop.lastExitCode} reachability={instReachability} />
                                  <span className="tree-label">{loopTitle}</span>
                                  <span
                                    className="tree-loop-status"
                                    style={{ color: loopColor }}
                                    title={loopLabel}
                                  >
                                    {loopLabel}
                                  </span>
                                  <span className="tree-loop-runcount">
                                    {loop.runCount > 0 ? `${loop.runCount}r` : ""}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })
                    ) : (
                      // Single instance: show loops directly below sessions
                      node.allLoops.map((loop) => {
                        const loopSelected = isLoopSelected(loop.id);
                        const loopTitle = loop.description?.trim() || loop.id;
                        const envReachability = reachability?.[primaryInstance.envId];
                        const fleetItem = loopStatusToFleetItem(loop.status, loop.lastExitCode, envReachability);
                        const loopColor = PILL_COLORS[fleetItem];
                        const loopLabel = getPillLabel(fleetItem);

                        return (
                          <div
                            key={loop.id}
                            className={`tree-node tree-node-depth-1${loopSelected ? " selected" : ""}`}
                            onClick={() => {
                              onSelect(primaryInstance.envId);
                              onNavigate({ kind: "loop", loopId: loop.id });
                            }}
                          >
                            <span className="tree-chevron placeholder"><ChevronRight size={10} /></span>
                            <LoopStatusDot status={loop.status} lastExitCode={loop.lastExitCode} reachability={envReachability} />
                            <span className="tree-label">{loopTitle}</span>
                            <span
                              className="tree-loop-status"
                              style={{ color: loopColor }}
                              title={loopLabel}
                            >
                              {loopLabel}
                            </span>
                            <span className="tree-loop-runcount">
                              {loop.runCount > 0 ? `${loop.runCount}r` : ""}
                            </span>
                          </div>
                        );
                      })
                    )}
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
          reachability={reachability}
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
            reachability={reachability}
          />
        ) : null}
        <span style={{ flex: 1 }} />
        <button
          className="sidebar-toolbar-btn"
          title={intl.formatMessage({ id: "settings.title" })}
          onClick={onOpenSettings}
        >
          <Settings size={14} />
        </button>
        <OrbionMark size={24} />
        <span>{intl.formatMessage({ id: "sidebar.orbion" })}</span>
      </div>

      {/* Context menu for moving sessions between projects */}
      {contextMenu ? (() => {
        // Build the list of target projects (all projects except the session's current one)
        const targetProjects = projectNodes
          .map((n) => n.projectName)
          .filter((name) => name !== contextMenu.currentProjectName);

        return (
          <div
            className="sidebar-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sidebar-context-menu-header">
              {intl.formatMessage({ id: "sidebar.moveToProject" })}
            </div>
            {targetProjects.length === 0 ? (
              <div className="sidebar-context-menu-item sidebar-context-menu-item-disabled">
                —
              </div>
            ) : (
              targetProjects.map((projectName) => (
                <div
                  key={projectName}
                  className="sidebar-context-menu-item"
                  onClick={() => {
                    onMoveSessionToProject?.(contextMenu.sessionId, projectName);
                    setContextMenu(null);
                  }}
                >
                  {projectName}
                </div>
              ))
            )}
          </div>
        );
      })() : null}
    </div>
  );
}
