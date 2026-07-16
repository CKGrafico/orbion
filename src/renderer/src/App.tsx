import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";
import type { ConnectionStatus, EndpointHealth, OpenCodeConnectionStatus } from "../../shared/ipc";
import type { Environment, EnvironmentHealth, LoopMeta } from "./types";
import type { FleetItemStatus } from "./fleet-status";
import { rollUpEnvironmentStatus, isNotifiableStatus, getPillLabel } from "./fleet-status";
import { loopStatusToFleetItem } from "./fleet-mapping";
import { useEnvironments } from "./store";
import { OrbionMark } from "./components/OrbionMark";
import { fetchLoops, fetchSettings, isMock } from "./api";
import type { DaemonSettings } from "./api";
import { useUnreadTracker } from "./use-unread-tracker";
import { createNotificationBridge } from "./use-notifications";
import { PanelLeft, Search, ArrowLeft, RotateCw, X, Star } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { InfraChatPanel } from "./components/InfraChatPanel";
import { AddVmWizard } from "./components/AddVmWizard";
import { LoopDetail } from "./components/LoopDetail";
import { PickMainVmModal } from "./components/PickMainVmModal";
import { ProjectsView } from "./components/ProjectsView";
import { hostLabel, timeAgo } from "./format";
import { translateMessage, standaloneIntl } from "./i18n";

type View = { kind: "list" } | { kind: "loop"; loopId: string };

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

function healthTooltip(intl: ReturnType<typeof useIntl>, health: EnvironmentHealth, status?: ConnectionStatus | null): string {
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

export function App(): React.ReactNode {
  const { environments, selectedId, mainVm, select, add, remove, setActiveEndpoint, setMainVm, reload } = useEnvironments();
  const intl = useIntl();
  const [view, setView] = useState<View>({ kind: "list" });
  const [filter, setFilter] = useState("");
  const [vmWizardOpen, setVmWizardOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pickMainVmOpen, setPickMainVmOpen] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [health, setHealth] = useState<Record<string, EnvironmentHealth>>({});
  const [connectionStatus, setConnectionStatus] = useState<Record<string, ConnectionStatus>>({});
  const [endpointHealth, setEndpointHealth] = useState<Record<string, EndpointHealth[]>>({});
  const [openCodeStatus, setOpenCodeStatus] = useState<Record<string, OpenCodeConnectionStatus>>({});
  const [loops, setLoops] = useState<LoopMeta[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [mutedEnvs, setMutedEnvs] = useState<Set<string>>(() => {
    if (window.api) return new Set<string>();
    try {
      const raw = localStorage.getItem("orbion.muted.v1");
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch { /* empty */ }
    return new Set<string>();
  });
  const [perEnvLoops, setPerEnvLoops] = useState<Record<string, LoopMeta[]>>({});
  const [daemonSettings, setDaemonSettings] = useState<DaemonSettings | null>(null);
  const filterRef = useRef<HTMLInputElement | null>(null);

  const { isUnread, markVisited } = useUnreadTracker();

  const notificationBridge = useMemo(
    () => {
      const bridge = createNotificationBridge((envId, itemId, itemType) => {
        select(envId);
        if (itemType === "loop") {
          setView({ kind: "loop", loopId: itemId });
        } else {
          setView({ kind: "list" });
        }
      });
      if (!window.api) {
        try {
          const raw = localStorage.getItem("orbion.muted.v1");
          if (raw) {
            for (const id of JSON.parse(raw) as string[]) {
              bridge.setMuted(id, true);
            }
          }
        } catch { /* empty */ }
      }
      return bridge;
    },
    [select],
  );

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
        try {
          const res = await fetchLoops(env);
          if (cancelled) return;
          const h: EnvironmentHealth = res.ok ? "ok" : "offline";
          setHealth((prev) => (prev[env.id] === h ? prev : { ...prev, [env.id]: h }));
          if (res.ok && Array.isArray(res.data)) {
            setPerEnvLoops((prev) => {
              if (prev[env.id] === res.data) return prev;
              return { ...prev, [env.id]: res.data };
            });
          }
        } catch {
          if (!cancelled) {
            setHealth((prev) => (prev[env.id] === "offline" ? prev : { ...prev, [env.id]: "offline" }));
          }
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
            message: standaloneIntl.formatMessage({ id: "app.notificationItemNeedsAttention" }, { envName: env.name, itemType: "loop" }),
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
      if (!window.api) {
        localStorage.setItem("orbion.muted.v1", JSON.stringify([...next]));
      }
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
        setPerEnvLoops((prev) => ({ ...prev, [selected.id]: res.data }));
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

  useEffect(() => {
    if (!selected) { setDaemonSettings(null); return; }
    const connStatus = connectionStatus[selected.id];
    if (!connStatus || connStatus.phase !== "connected") return;
    let cancelled = false;
    void fetchSettings(selected).then((res) => {
      if (!cancelled && res.ok && res.data) setDaemonSettings(res.data);
    });
    return () => { cancelled = true; };
  }, [selected?.id, selected?.activeEndpointId, connectionStatus[selected?.id ?? ""]?.phase]);

  const handleSelect = (id: string): void => {
    select(id);
    markVisited(id);
    setView({ kind: "list" });
    setFilter("");
  };

  const handleRetry = useCallback((id: string): void => {
    if (window.api) {
      void window.api.connection.retry(id);
    }
  }, []);

  const handleRemove = (id: string): void => {
    const env = environments.find((e) => e.id === id);
    const wasMainVm = env?.role === "main-vm";
    remove(id);
    setConfirmRemoveId(null);
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

  const handleVmWizardDone = (_environmentId: string, _environmentName: string, _daemonUrl: string): void => {
    setVmWizardOpen(false);
    void reload().then(() => handleSelect(_environmentId));
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
          title={sidebarOpen ? intl.formatMessage({ id: "app.hideSidebar" }) : intl.formatMessage({ id: "app.showSidebar" })}
          onClick={() => setSidebarOpen((v) => !v)}
        >
          <PanelLeft size={15} />
        </button>
        <button
          className="icon-btn"
          title={intl.formatMessage({ id: "app.search" })}
          onClick={() => filterRef.current?.focus()}
        >
          <Search size={15} />
        </button>
        <button
          className="icon-btn"
          title={intl.formatMessage({ id: "app.back" })}
          disabled={!inDetail}
          style={!inDetail ? { opacity: 0.35, cursor: "default" } : undefined}
          onClick={goBack}
        >
          <ArrowLeft size={15} />
        </button>
        <span className="titlebar-brand">
          <OrbionMark size={16} />
          {intl.formatMessage({ id: "app.brand" })}
        </span>
        <span className="titlebar-tag">{isMock ? intl.formatMessage({ id: "app.mock" }) : intl.formatMessage({ id: "app.preview" })}</span>
      </div>

      <div className="body">
        {sidebarOpen ? (
          <aside className="panel sidebar-panel">
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
              onAddVm={() => setVmWizardOpen(true)}
              onRemove={handleRemove}
              onRetry={handleRetry}
              onSetEndpoint={handleSetEndpoint}
            />
          </aside>
        ) : null}

        <div className="panel main-panel">
          {selected ? (
            <div className="main-header">
              {/* Left group: name · IP · status dots */}
              <span className="main-title">{selected.name}</span>

              {activeEndpoint ? (
                <span className="chip mono" title={activeEndpoint.url}>
                  {activeEndpoint.sshTarget ?? hostLabel(activeEndpoint.url)}
                </span>
              ) : null}

              {/* Daemon connection dot */}
              {(() => {
                const h = health[selected.id] ?? "unknown";
                const dotColor =
                  h === "ok" ? "var(--health-ok)"
                  : h === "connecting" ? "var(--health-connecting)"
                  : h === "backoff" ? "var(--health-backoff)"
                  : h === "blocked" ? "var(--health-blocked)"
                  : "var(--health-offline)";
                return (
                  <span className="chip" title={healthTooltip(intl, h, connectionStatus[selected.id])} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                    {intl.formatMessage({ id: "app.daemonChip" })}
                  </span>
                );
              })()}

              {daemonSettings ? (
                <>
                  <span className={`chip ${daemonSettings.httpApiEnabled ? "chip-ok" : "chip-off"}`} title={intl.formatMessage({ id: "app.daemonHttpApi" })}>HTTP</span>
                  <span className={`chip ${daemonSettings.mcpApiEnabled ? "chip-ok" : "chip-off"}`} title={intl.formatMessage({ id: "app.daemonMcpApi" })}>MCP</span>
                </>
              ) : null}

              {/* Spacer */}
              <span style={{ flex: 1 }} />

              {/* Right group: meta · remove · mark-as-main */}
              <span className="main-header-meta" style={{ marginLeft: 0 }}>
                {(() => {
                  const h = health[selected.id] ?? "unknown";
                  const cs = connectionStatus[selected.id];
                  if (cs && cs.phase === "blocked" && cs.lastError) {
                    return intl.formatMessage({ id: "app.blockedLabel" }, { detail: translateMessage(intl, cs.lastError) });
                  }
                  if (h === "offline" || h === "backoff" || h === "blocked" || h === "connecting") {
                    return intl.formatMessage({ id: `app.${h}` });
                  }
                  return intl.formatMessage({ id: "app.updatedLabel" }, { time: updatedLabel });
                })()}
              </span>

              <button
                className="icon-btn"
                title={intl.formatMessage({ id: "app.removeEnvironment" })}
                onClick={() => setConfirmRemoveId(selected.id)}
                style={{ color: "var(--danger)", opacity: 0.7 }}
              >
                <X size={14} />
              </button>

              {selected.role !== "main-vm" ? (
                <button
                  className="icon-btn"
                  title={intl.formatMessage({ id: "app.markAsMainTooltip" })}
                  onClick={() => { setMainVm(selected.id); }}
                  style={{ opacity: 0.6 }}
                >
                  <Star size={14} />
                </button>
              ) : (
                <span
                  title={intl.formatMessage({ id: "app.isMainTooltip" })}
                  style={{ display: "flex", alignItems: "center", padding: "0 4px", color: "var(--chip-warm)", opacity: 0.9 }}
                >
                  <Star size={14} fill="currentColor" />
                </span>
              )}
            </div>
          ) : null}

          <div className="content">
            {!selected ? (
              <div className="empty">
                <span className="glyph">
                  <RotateCw size={30} strokeWidth={1.2} />
                </span>
                <h3>{intl.formatMessage({ id: "app.noEnvironmentSelected" })}</h3>
                <p>
                  {intl.formatMessage({ id: "app.noEnvironmentDescription" })}
                </p>
                <button className="btn primary" onClick={() => setVmWizardOpen(true)}>
                  {intl.formatMessage({ id: "app.addEnvironment" })}
                </button>
              </div>
            ) : inDetail ? (
              <LoopDetail
                instance={selected}
                loopId={(view as { kind: "loop"; loopId: string }).loopId}
                initial={loops.find((l) => l.id === (view as { loopId: string }).loopId) ?? null}
                onBack={goBack}
              />
            ) : (
              <ProjectsView instance={selected} loops={loops} filter={filter} />
            )}
          </div>

          {selected && !inDetail && mainVm ? (
            <InfraChatPanel mainVmId={mainVm.id} mainVmName={mainVm.name} />
          ) : selected && !inDetail && !mainVm ? (
            <div className="prompt-bar">
              <div className="prompt-box">
                <input
                  ref={filterRef}
                  placeholder={intl.formatMessage({ id: "app.filterLoops" })}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
                <div className="prompt-row">
                  <span className="prompt-chip">{intl.formatMessage({ id: "app.loops" })}</span>
                  <span className="prompt-meta">{activeEndpoint ? hostLabel(activeEndpoint.url) : ""}</span>
                  <span style={{ flex: 1 }} />
                  <span className="prompt-meta mono">{intl.formatMessage({ id: "app.loopsCount" }, { count: loops.length })}</span>
                  <button
                    className="prompt-action"
                    title={intl.formatMessage({ id: "app.refreshNow" })}
                    onClick={() => setRefreshTick((n) => n + 1)}
                  >
                    <RotateCw size={14} strokeWidth={1.8} />
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

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

      {confirmRemoveId ? (() => {
        const env = environments.find((e) => e.id === confirmRemoveId);
        return (
          <div className="modal-backdrop" onClick={() => setConfirmRemoveId(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 380 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
                {intl.formatMessage({ id: "app.removeEnvironment" })}
              </h2>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 20px", lineHeight: 1.5 }}>
                {intl.formatMessage({ id: "app.removeConfirm" }, { name: env?.name ?? confirmRemoveId })}
              </p>
              <div className="modal-actions">
                <button className="btn" onClick={() => setConfirmRemoveId(null)}>
                  {intl.formatMessage({ id: "app.removeCancel" })}
                </button>
                <button
                  className="btn"
                  style={{ background: "color-mix(in srgb, var(--danger) 18%, transparent)", color: "var(--danger)", borderColor: "color-mix(in srgb, var(--danger) 30%, transparent)" }}
                  onClick={() => handleRemove(confirmRemoveId)}
                >
                  {intl.formatMessage({ id: "app.removeConfirmBtn" })}
                </button>
              </div>
            </div>
          </div>
        );
      })() : null}
    </div>
  );
}
