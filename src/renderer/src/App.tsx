import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConnectionStatus, EndpointHealth, OpenCodeConnectionStatus } from "../../shared/ipc";
import type { Environment, EnvironmentHealth, LoopMeta, Section } from "./types";
import type { FleetItemStatus } from "./fleet-status";
import { rollUpEnvironmentStatus, isNotifiableStatus, PILL_LABELS } from "./fleet-status";
import { loopStatusToFleetItem } from "./fleet-mapping";
import { useEnvironments } from "./store";
import { fetchLoops, isMock } from "./api";
import { useUnreadTracker } from "./use-unread-tracker";
import { createNotificationBridge } from "./use-notifications";
import { Sidebar } from "./components/Sidebar";
import { SegmentedTabs } from "./components/SegmentedTabs";
import { AddEnvironmentModal } from "./components/AddInstanceModal";
import { AddVmWizard } from "./components/AddVmWizard";
import { LoopsView } from "./components/LoopsView";
import { LoopDetail } from "./components/LoopDetail";
import { TasksView } from "./components/TasksView";
import { ProjectsView } from "./components/ProjectsView";
import { Icon } from "./components/Icon";
import { InfraChatPanel } from "./components/InfraChatPanel";
import { PickMainVmModal } from "./components/PickMainVmModal";
import { hostLabel, timeAgo } from "./format";
import { TranscriptView } from "./chat/TranscriptView";
import { generateMockSession, generateStreamingTurn } from "./chat/mock-session";

type View = { kind: "list" } | { kind: "loop"; loopId: string };

const SECTION_LABELS: Record<Section, string> = {
  loops: "Loops",
  tasks: "Tasks",
  projects: "Projects",
  chat: "Chat",
};

function phaseToHealth(phase: ConnectionStatus["phase"]): EnvironmentHealth {
  switch (phase) {
    case "connected":
      return "ok";
    case "connecting":
      return "connecting";
    case "backoff":
      return "backoff";
    case "blocked":
      return "blocked";
    case "offline":
      return "offline";
    default:
      return "unknown";
  }
}

export function App(): React.ReactNode {
  const { environments, selectedId, mainVm, select, add, remove, setActiveEndpoint, setOpenCodeEndpoint, setMainVm } = useEnvironments();
  const [section, setSection] = useState<Section>("loops");
  const [view, setView] = useState<View>({ kind: "list" });
  const [filter, setFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [vmWizardOpen, setVmWizardOpen] = useState(false);
  const [repairEnvironmentId, setRepairEnvironmentId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pickMainVmOpen, setPickMainVmOpen] = useState(false);
  const [health, setHealth] = useState<Record<string, EnvironmentHealth>>({});
  const [connectionStatus, setConnectionStatus] = useState<Record<string, ConnectionStatus>>({});
  const [endpointHealth, setEndpointHealth] = useState<Record<string, EndpointHealth[]>>({});
  const [openCodeStatus, setOpenCodeStatus] = useState<Record<string, OpenCodeConnectionStatus>>({});
  const [loops, setLoops] = useState<LoopMeta[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [mutedEnvs, setMutedEnvs] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("orbion.muted.v1");
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch { /* empty */ }
    return new Set<string>();
  });
  const [perEnvLoops, setPerEnvLoops] = useState<Record<string, LoopMeta[]>>({});
  const filterRef = useRef<HTMLInputElement | null>(null);

  const { isUnread, markVisited } = useUnreadTracker();

  const notificationBridge = useMemo(
    () => {
      const bridge = createNotificationBridge((envId, itemId, itemType) => {
        select(envId);
        if (itemType === "loop") {
          setSection("loops");
          setView({ kind: "loop", loopId: itemId });
        } else {
          setSection("chat");
          setView({ kind: "list" });
        }
      });
      try {
        const raw = localStorage.getItem("orbion.muted.v1");
        if (raw) {
          for (const id of JSON.parse(raw) as string[]) {
            bridge.setMuted(id, true);
          }
        }
      } catch { /* empty */ }
      return bridge;
    },
    [select],
  );

  const mockChatTurns = useMemo(() => generateMockSession(50, 12), []);
  const mockStreamingTurn = useMemo(() => generateStreamingTurn(), []);

  const selected: Environment | null = environments.find((e) => e.id === selectedId) ?? null;

  useEffect(() => {
    if (!window.api) return;

    const unsub = window.api.connection.onStatusChange(
      (environmentId: string, status: ConnectionStatus) => {
        const h = phaseToHealth(status.phase);
        setHealth((prev) => (prev[environmentId] === h ? prev : { ...prev, [environmentId]: h }));
        setConnectionStatus((prev) =>
          prev[environmentId] === status ? prev : { ...prev, [environmentId]: status },
        );
      },
    );
    return unsub;
  }, []);

  useEffect(() => {
    if (!window.api) return;

    const unsub = window.api.connection.onEndpointHealthChange(
      (environmentId: string, health: EndpointHealth[]) => {
        setEndpointHealth((prev) => {
          const existing = prev[environmentId];
          if (existing && existing.length === health.length && existing.every((h, i) => h.endpointId === health[i].endpointId && h.phase === health[i].phase)) {
            return prev;
          }
          return { ...prev, [environmentId]: health };
        });
      },
    );
    return unsub;
  }, []);

  useEffect(() => {
    if (!window.api) return;

    const unsub = window.api.opencode.onStatusChange(
      (environmentId: string, status: OpenCodeConnectionStatus) => {
        setOpenCodeStatus((prev) =>
          prev[environmentId] === status ? prev : { ...prev, [environmentId]: status },
        );
      },
    );
    return unsub;
  }, []);

  useEffect(() => {
    if (window.api || environments.length === 0) return;
    let cancelled = false;

    const check = async (): Promise<void> => {
      for (const env of environments) {
        const res = await fetchLoops(env);
        if (cancelled) return;
        const h: EnvironmentHealth = res.ok ? "ok" : "offline";
        setHealth((prev) => (prev[env.id] === h ? prev : { ...prev, [env.id]: h }));
        if (res.ok && Array.isArray(res.data)) {
          setPerEnvLoops((prev) => {
            if (prev[env.id] === res.data) return prev;
            return { ...prev, [env.id]: res.data as LoopMeta[] };
          });
        }
      }
    };

    void check();
    const timer = setInterval(() => void check(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [environments]);

  useEffect(() => {
    if (!window.api || environments.length === 0) return;
    let cancelled = false;

    const fetchAll = async (): Promise<void> => {
      for (const env of environments) {
        const status = await window.api!.connection.getStatus(env.id);
        if (cancelled || !status) return;
        const h = phaseToHealth(status.phase);
        setHealth((prev) => (prev[env.id] === h ? prev : { ...prev, [env.id]: h }));
        setConnectionStatus((prev) =>
          prev[env.id] === status ? prev : { ...prev, [env.id]: status },
        );
      }
    };

    const fetchOpenCode = async (): Promise<void> => {
      for (const env of environments) {
        if (!env.opencode) continue;
        const status = await window.api!.opencode.getStatus(env.id);
        if (cancelled) return;
        setOpenCodeStatus((prev) =>
          prev[env.id] === status ? prev : { ...prev, [env.id]: status },
        );
      }
    };

    void fetchAll();
    void fetchOpenCode();
    return () => { cancelled = true; };
  }, [environments]);

  useEffect(() => {
    if (!window.api) return;

    const report = (): void => {
      window.api!.connection.notifyNetworkChanged(navigator.onLine);
    };

    window.addEventListener("online", report);
    window.addEventListener("offline", report);
    report();

    return () => {
      window.removeEventListener("online", report);
      window.removeEventListener("offline", report);
    };
  }, []);

  const fleetStatus = useMemo<Record<string, FleetItemStatus>>(() => {
    const result: Record<string, FleetItemStatus> = {};
    for (const env of environments) {
      const envLoops = perEnvLoops[env.id] ?? [];
      const childStatuses: FleetItemStatus[] = envLoops.map((l) =>
        loopStatusToFleetItem(l.status, l.lastExitCode),
      );
      result[env.id] = rollUpEnvironmentStatus(childStatuses);
    }
    return result;
  }, [environments, perEnvLoops]);

  const unreadEnvs = useMemo<Set<string>>(() => {
    const ids = new Set<string>();
    for (const env of environments) {
      const envLoops = perEnvLoops[env.id] ?? [];
      const hasUnread = envLoops.some((l) => {
        if (l.status !== "running" && l.lastRunAt) {
          return isUnread(l.id, new Date(l.lastRunAt).getTime());
        }
        return false;
      });
      if (hasUnread) ids.add(env.id);
    }
    return ids;
  }, [environments, perEnvLoops, isUnread]);

  const prevFleetStatus = useRef<Record<string, FleetItemStatus>>({});
  useEffect(() => {
    for (const env of environments) {
      const current = fleetStatus[env.id];
      const prev = prevFleetStatus.current[env.id];
      if (current !== prev && isNotifiableStatus(current) && prev !== undefined) {
        if (!mutedEnvs.has(env.id)) {
          notificationBridge.sendNotification({
            environmentId: env.id,
            environmentName: env.name,
            itemId: env.id,
            itemType: "loop",
            status: current,
            message: `${env.name} is ${PILL_LABELS[current]}`,
          });
        }
      }
    }
    prevFleetStatus.current = { ...fleetStatus };
  }, [fleetStatus, environments, notificationBridge, mutedEnvs]);

  const handleToggleMute = useCallback((environmentId: string) => {
    setMutedEnvs((prev) => {
      const next = new Set(prev);
      if (next.has(environmentId)) next.delete(environmentId);
      else next.add(environmentId);
      localStorage.setItem("orbion.muted.v1", JSON.stringify([...next]));
      notificationBridge.setMuted(environmentId, next.has(environmentId));
      return next;
    });
  }, [notificationBridge]);

  useEffect(() => {
    if (!selected) {
      setLoops([]);
      return;
    }

    const connStatus = connectionStatus[selected.id];
    if (connStatus && connStatus.phase !== "connected") {
      setLoops([]);
      return;
    }

    let cancelled = false;

    const load = async (): Promise<void> => {
      const res = await fetchLoops(selected);
      if (cancelled) return;
      if (res.ok && Array.isArray(res.data)) {
        setLoops(res.data);
        setPerEnvLoops((prev) => ({ ...prev, [selected.id]: res.data as LoopMeta[] }));
        setLastUpdated(Date.now());
      }
    };

    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selected?.id, selected?.activeEndpointId, refreshTick, connectionStatus[selected?.id ?? ""]?.phase]);

  const handleSelect = (id: string): void => {
    select(id);
    markVisited(id);
    setSection("loops");
    setView({ kind: "list" });
    setFilter("");
  };

  const handleRetry = useCallback((id: string): void => {
    if (window.api) {
      void window.api.connection.retry(id);
    }
  }, []);

  const handleSection = (next: Section): void => {
    setSection(next);
    setView({ kind: "list" });
    setFilter("");
  };

  const handleAdd = (name: string, baseUrl: string, kind?: "direct" | "ssh" | "tailscale", openCodeUrl?: string, openCodePassword?: string): void => {
    void (async () => {
      const env = await add(name, baseUrl, kind);
      if (openCodeUrl && window.api) {
        await window.api.config.setOpenCodeEndpoint(env.id, { url: openCodeUrl, password: openCodePassword ?? null });
      }
      handleSelect(env.id);
      setModalOpen(false);
    })();
  };

  const handleRemove = (id: string): void => {
    const env = environments.find((e) => e.id === id);
    const wasMainVm = env?.role === "main-vm";
    remove(id);
    setHealth((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (wasMainVm && environments.filter((e) => e.id !== id).length > 0) {
      setPickMainVmOpen(true);
    }
  };

  const handleSetEndpoint = (environmentId: string, endpointId: string): void => {
    setActiveEndpoint(environmentId, endpointId);
  };

  const handleRepair = (id: string): void => {
    setRepairEnvironmentId(id);
    setModalOpen(true);
  };

  const handleVmWizardDone = (_environmentId: string, _environmentName: string, _daemonUrl: string): void => {
    setVmWizardOpen(false);
    handleSelect(_environmentId);
  };

  const openLoop = (loopId: string): void => setView({ kind: "loop", loopId });
  const goBack = (): void => setView({ kind: "list" });

  const inDetail = view.kind === "loop";
  const updatedLabel =
    lastUpdated === null ? "…" : timeAgo(new Date(lastUpdated).toISOString());

  const activeEndpoint = selected
    ? (selected.activeEndpointId
        ? selected.endpoints.find((ep) => ep.id === selected.activeEndpointId)
        : selected.endpoints[0])
    : null;

  return (
    <div className="app">
      <div className="titlebar">
        <button
          className="icon-btn"
          title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          onClick={() => setSidebarOpen((v) => !v)}
        >
          <Icon name="panelLeft" size={15} />
        </button>
        <button
          className="icon-btn"
          title="Search (focus filter)"
          onClick={() => filterRef.current?.focus()}
        >
          <Icon name="search" size={15} />
        </button>
        <button
          className="icon-btn"
          title="Back"
          disabled={!inDetail}
          style={!inDetail ? { opacity: 0.35, cursor: "default" } : undefined}
          onClick={goBack}
        >
          <Icon name="arrowLeft" size={15} />
        </button>
        <span className="titlebar-brand">Loop Task</span>
        <span className="titlebar-tag">{isMock ? "mock" : "preview"}</span>
      </div>

      <div className="body">
        {sidebarOpen ? (
          <aside className="panel sidebar-panel">
            <SegmentedTabs active={section} onChange={handleSection} disabled={!selected} />
            <Sidebar
              environments={environments}
              selectedId={selectedId}
              health={health}
              connectionStatus={connectionStatus}
              endpointHealth={endpointHealth}
              openCodeStatus={openCodeStatus}
              fleetStatus={fleetStatus}
              unreadEnvs={unreadEnvs}
              mutedEnvs={mutedEnvs}
              onToggleMute={handleToggleMute}
              onSelect={handleSelect}
              onAdd={() => setModalOpen(true)}
              onAddVm={() => setVmWizardOpen(true)}
              onRemove={handleRemove}
              onRetry={handleRetry}
              onSetEndpoint={handleSetEndpoint}
              onRepair={handleRepair}
              onSetOpenCodeEndpoint={setOpenCodeEndpoint}
            />
            {mainVm ? (
              <InfraChatPanel mainVmId={mainVm.id} mainVmName={mainVm.name} />
            ) : null}
          </aside>
        ) : null}

        <div className="panel main-panel">
          {selected ? (
            <div className="main-header">
              <span className="main-title">{selected.name}</span>
              {activeEndpoint ? (
                <span className="chip mono">{hostLabel(activeEndpoint.url)}</span>
              ) : null}
              <span className="main-header-meta">
                {(() => {
                  const h = health[selected.id] ?? "unknown";
                  const cs = connectionStatus[selected.id];
                  if (cs && cs.phase === "blocked" && cs.lastError) {
                    return `blocked: ${cs.lastError}`;
                  }
                  if (h === "offline" || h === "backoff" || h === "blocked" || h === "connecting") {
                    return h;
                  }
                  return `updated ${updatedLabel}`;
                })()}
              </span>
            </div>
          ) : null}

          <div className="content">
            {!selected ? (
              <div className="empty">
                <span className="glyph">
                  <Icon name="rotate" size={30} strokeWidth={1.2} />
                </span>
                <h3>No environment selected</h3>
                <p>
                  Add a loop-task environment by its API URL (for example{" "}
                  <code>http://127.0.0.1:8845</code>) to see its loops, tasks, and projects.
                </p>
                <button className="btn primary" onClick={() => setModalOpen(true)}>
                  Add environment
                </button>
              </div>
            ) : inDetail ? (
              <LoopDetail
                instance={selected}
                loopId={(view as { kind: "loop"; loopId: string }).loopId}
                initial={loops.find((l) => l.id === (view as { loopId: string }).loopId) ?? null}
                onBack={goBack}
              />
            ) : section === "loops" ? (
              <LoopsView
                instance={selected}
                loops={loops}
                filter={filter}
                health={health[selected.id] ?? "unknown"}
                onOpenLoop={openLoop}
              />
            ) : section === "tasks" ? (
              <TasksView instance={selected} filter={filter} />
            ) : section === "chat" ? (
              <div className="content content-chat">
                <TranscriptView
                  initialTurns={mockChatTurns}
                  streamingTurn={mockStreamingTurn}
                />
              </div>
            ) : (
              <ProjectsView instance={selected} loops={loops} filter={filter} />
            )}
          </div>

          {selected && !inDetail ? (
            <div className="prompt-bar">
              <div className="prompt-box">
                <input
                  ref={filterRef}
                  placeholder={`Filter ${SECTION_LABELS[section].toLowerCase()}…`}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
                <div className="prompt-row">
                  <span className="prompt-chip">{SECTION_LABELS[section]}</span>
                  <span className="prompt-meta">{activeEndpoint ? hostLabel(activeEndpoint.url) : ""}</span>
                  <span style={{ flex: 1 }} />
                  {section === "loops" ? (
                    <span className="prompt-meta mono">{loops.length} loops</span>
                  ) : null}
                  <button
                    className="prompt-action"
                    title="Refresh now"
                    onClick={() => setRefreshTick((n) => n + 1)}
                  >
                    <Icon name="rotate" size={14} strokeWidth={1.8} />
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {modalOpen ? (
        <AddEnvironmentModal
          onSubmit={handleAdd}
          onCancel={() => { setModalOpen(false); setRepairEnvironmentId(null); }}
          repairEnvironmentId={repairEnvironmentId}
        />
      ) : null}

      {vmWizardOpen ? (
        <AddVmWizard
          onDone={handleVmWizardDone}
          onCancel={() => setVmWizardOpen(false)}
        />
      ) : null}

      {pickMainVmOpen ? (
        <PickMainVmModal
          candidates={environments.filter((e) => e.role !== "main-vm")}
          onPick={(id) => {
            setMainVm(id);
            setPickMainVmOpen(false);
          }}
          onSkip={() => setPickMainVmOpen(false)}
        />
      ) : null}
    </div>
  );
}
