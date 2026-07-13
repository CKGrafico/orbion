import { useCallback, useEffect, useRef, useState } from "react";
import type { Instance, InstanceHealth, LoopMeta, Section } from "./types";
import { useInstances } from "./store";
import { fetchLoops, isMock } from "./api";
import { Sidebar } from "./components/Sidebar";
import { SegmentedTabs } from "./components/SegmentedTabs";
import { AddInstanceModal } from "./components/AddInstanceModal";
import { LoopsView } from "./components/LoopsView";
import { LoopDetail } from "./components/LoopDetail";
import { TasksView } from "./components/TasksView";
import { ProjectsView } from "./components/ProjectsView";
import { Icon } from "./components/Icon";
import { hostLabel, timeAgo } from "./format";

type View = { kind: "list" } | { kind: "loop"; loopId: string };

const SECTION_LABELS: Record<Section, string> = {
  loops: "Loops",
  tasks: "Tasks",
  projects: "Projects",
};

export function App(): React.ReactNode {
  const { instances, selectedId, select, add, remove } = useInstances();
  const [section, setSection] = useState<Section>("loops");
  const [view, setView] = useState<View>({ kind: "list" });
  const [filter, setFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [health, setHealth] = useState<Record<string, InstanceHealth>>({});
  const [loops, setLoops] = useState<LoopMeta[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const filterRef = useRef<HTMLInputElement | null>(null);

  const selected: Instance | null = instances.find((i) => i.id === selectedId) ?? null;

  const markHealth = useCallback((id: string, value: InstanceHealth) => {
    setHealth((prev) => (prev[id] === value ? prev : { ...prev, [id]: value }));
  }, []);

  // Poll loops for the selected instance (the daemon's /api/events SSE is not
  // fed server-side, so polling is the reliable option). refreshTick allows a
  // manual refresh from the prompt bar's action button.
  useEffect(() => {
    if (!selected) {
      setLoops([]);
      return;
    }
    let cancelled = false;

    const load = async (): Promise<void> => {
      const res = await fetchLoops(selected);
      if (cancelled) return;
      if (res.ok && Array.isArray(res.data)) {
        setLoops(res.data);
        setLastUpdated(Date.now());
        markHealth(selected.id, "ok");
      } else {
        markHealth(selected.id, "offline");
      }
    };

    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selected?.id, selected?.baseUrl, markHealth, refreshTick]);

  // Background health checks for non-selected instances.
  useEffect(() => {
    if (instances.length === 0) return;
    let cancelled = false;

    const check = async (): Promise<void> => {
      for (const instance of instances) {
        if (instance.id === selectedId) continue;
        const res = await fetchLoops(instance);
        if (cancelled) return;
        markHealth(instance.id, res.ok ? "ok" : "offline");
      }
    };

    void check();
    const timer = setInterval(() => void check(), 20000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [instances, selectedId, markHealth]);

  const handleSelect = (id: string): void => {
    select(id);
    setSection("loops");
    setView({ kind: "list" });
    setFilter("");
  };

  const handleSection = (next: Section): void => {
    setSection(next);
    setView({ kind: "list" });
    setFilter("");
  };

  const handleAdd = (name: string, baseUrl: string): void => {
    void (async () => {
      const instance = await add(name, baseUrl);
      handleSelect(instance.id);
      setModalOpen(false);
    })();
  };

  const handleRemove = (id: string): void => {
    remove(id);
    setHealth((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const openLoop = (loopId: string): void => setView({ kind: "loop", loopId });
  const goBack = (): void => setView({ kind: "list" });

  const inDetail = view.kind === "loop";
  const updatedLabel =
    lastUpdated === null ? "…" : timeAgo(new Date(lastUpdated).toISOString());

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
              instances={instances}
              selectedId={selectedId}
              health={health}
              onSelect={handleSelect}
              onAdd={() => setModalOpen(true)}
              onRemove={handleRemove}
            />
          </aside>
        ) : null}

        <div className="panel main-panel">
          {selected ? (
            <div className="main-header">
              <span className="main-title">{selected.name}</span>
              <span className="chip mono">{hostLabel(selected.baseUrl)}</span>
              <span className="main-header-meta">
                {(health[selected.id] ?? "unknown") === "offline"
                  ? "offline"
                  : `updated ${updatedLabel}`}
              </span>
            </div>
          ) : null}

          <div className="content">
            {!selected ? (
              <div className="empty">
                <span className="glyph">
                  <Icon name="rotate" size={30} strokeWidth={1.2} />
                </span>
                <h3>No instance selected</h3>
                <p>
                  Add a loop-task instance by its API URL (for example{" "}
                  <code>http://127.0.0.1:8845</code>) to see its loops, tasks, and projects.
                </p>
                <button className="btn primary" onClick={() => setModalOpen(true)}>
                  Add instance
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
                  <span className="prompt-meta">{hostLabel(selected.baseUrl)}</span>
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
        <AddInstanceModal onSubmit={handleAdd} onCancel={() => setModalOpen(false)} />
      ) : null}
    </div>
  );
}
