import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";
import type { ConnectionStatus, EndpointHealth, OpenCodeConnectionStatus, BudgetBreach, DeepLinkTarget, OutageEscalation, ReachabilityState, ChatSession, AgentRuntime, BootstrapSeed, RestoreAvailability, PullRestoreResult, ModelInfo, ReasoningEffort, ReviewModeItem, GlobalSettings } from "../../shared/ipc";
import type { Environment, EnvironmentHealth, LoopMeta, Project, FleetLoopRollup, LoopWithOrigin } from "./types";
import type { FleetItemStatus } from "./fleet-status";
import { rollUpEnvironmentStatus, isNotifiableStatus } from "./fleet-status";
import { loopStatusToFleetItem } from "./fleet-mapping";
import { computeFleetRollup } from "./fleet-rollup";
import { useEnvironments } from "./store";
import { OrbionMark } from "./components/OrbionMark";
import { ColdOpen } from "./components/ColdOpen";
import { fetchLoops, fetchProjects, fetchSettings, isMock } from "./api";
import type { DaemonSettings } from "./api";
import { useUnreadTracker } from "./use-unread-tracker";
import { useNativeNotifications } from "./use-notifications";
import { useBudgetWatch } from "./use-budget-watch";
import { useLoopTransitions } from "./use-loop-transitions";
import type { LoopTransition } from "./use-loop-transitions";
import { PanelLeft, RotateCw, X, Star, BellOff, Bell } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { AddVmWizard } from "./components/AddVmWizard";
import { LoopDetail } from "./components/LoopDetail";
import { InstanceDetail } from "./components/InstanceDetail";
import { ProjectDetail } from "./components/ProjectDetail";
import { PickMainVmModal } from "./components/PickMainVmModal";
import { RestoreOffer } from "./components/RestoreOffer";
import { StaleConfigWarning } from "./components/StaleConfigWarning";
import { InboxView } from "./features/inbox/InboxView";
import { ReviewModeOverlay } from "./features/review/ReviewModeOverlay";
import { BudgetWatchPanel } from "./components/BudgetWatchPanel";
import { hostLabel, timeAgo } from "./format";
import { translateMessage, standaloneIntl } from "./i18n";
import { cid, useInject } from "inversify-hooks";
import type { IConnectionService, IOpenCodeService, IOutageService, IInboxService, IReachabilityService, IConfigService, ITranscriptService, IMcpService, InboxBuildParams, IPrPollingService, IPrVerdictService, IReviewModeService } from "./services/interfaces";
import { InfraChatPanel } from "./components/InfraChatPanel";
import { RuntimeHealthChip } from "./components/RuntimeHealthChip";
import { AgentRuntimeSwitcher } from "./components/AgentRuntimeSwitcher";
import { SessionChatView } from "./components/SessionChatView";
import { ModelSelector, getReasoningEffortsForModel } from "./components/ModelSelector";
import { ReasoningEffortSelector } from "./components/ReasoningEffortSelector";
import { InstanceSelector } from "./components/InstanceSelector";
import { InstanceSettingsPanel } from "./components/InstanceSettingsPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { ToastProvider, Toast, useToast } from "./components/Toast";
import type { IAgentService } from "./services/interfaces";

type View =
  | { kind: "inbox" }
  | { kind: "instance" }
  | { kind: "project"; projectId: string }
  | { kind: "loop"; loopId: string }
  | { kind: "session"; sessionId: string };

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
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

function AppInner(): React.ReactNode {
  const { environments, selectedId, mainVm, loaded, select, remove, update, addEndpoint, removeEndpoint, setActiveEndpoint, removeSessionToken, setMainVm, stampCheckedSetMainVm, forceSetMainVm, reload } = useEnvironments();
  const intl = useIntl();
  const [connectionService] = useInject<IConnectionService>(cid.IConnectionService);
  const [openCodeService] = useInject<IOpenCodeService>(cid.IOpenCodeService);
  const [outageService] = useInject<IOutageService>(cid.IOutageService);
  const [reachabilityService] = useInject<IReachabilityService>(cid.IReachabilityService);
  const [inboxService] = useInject<IInboxService>(cid.IInboxService);
  const [prPollingService] = useInject<IPrPollingService>(cid.IPrPollingService);
  const [prVerdictService] = useInject<IPrVerdictService>(cid.IPrVerdictService);
  const [reviewModeService] = useInject<IReviewModeService>(cid.IReviewModeService);
  const [configService] = useInject<IConfigService>(cid.IConfigService);
  const [transcriptService] = useInject<ITranscriptService>(cid.ITranscriptService);
  const [agentService] = useInject<IAgentService>(cid.IAgentService);
  const [mcpService] = useInject<IMcpService>(cid.IMcpService);
  const { showToast } = useToast();
  const [view, setView] = useState<View>({ kind: "instance" });
  const [vmWizardOpen, setVmWizardOpen] = useState(false);
  const [wizardSeed, setWizardSeed] = useState<BootstrapSeed | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pickMainVmOpen, setPickMainVmOpen] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [health, setHealth] = useState<Record<string, EnvironmentHealth>>({});
  const [connectionStatus, setConnectionStatus] = useState<Record<string, ConnectionStatus>>({});
  const [endpointHealth, setEndpointHealth] = useState<Record<string, EndpointHealth[]>>({});
  const [openCodeStatus, setOpenCodeStatus] = useState<Record<string, OpenCodeConnectionStatus>>({});
  const [loops, setLoops] = useState<LoopMeta[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [mutedEnvs, setMutedEnvs] = useState<Set<string>>(new Set<string>());
  const [perEnvLoops, setPerEnvLoops] = useState<Record<string, LoopMeta[]>>({});
  const [perEnvProjects, setPerEnvProjects] = useState<Record<string, Project[]>>({});
  const [daemonSettings, setDaemonSettings] = useState<DaemonSettings | null>(null);
  const [budgetPanelOpen, setBudgetPanelOpen] = useState(false);
  const [inboxDismissedIds, setInboxDismissedIds] = useState<Set<string>>(new Set());
  const [prAwaitingReview, setPrAwaitingReview] = useState<import("../../../shared/ipc").PrAwaitingReviewItem[]>([]);
  const [prVerdicts, setPrVerdicts] = useState<Map<string, import("../../../shared/ipc").PrVerdict>>(new Map());
  /** Currently active PR review mode item, or null when not in review mode */
  const [reviewModeItem, setReviewModeItem] = useState<ReviewModeItem | null>(null);
  /** Restore offer: availability from the config-home VM */
  const [restoreAvailability, setRestoreAvailability] = useState<RestoreAvailability | null>(null);
  /** Whether the restore offer is showing */
  const [restoreOfferOpen, setRestoreOfferOpen] = useState(false);
  /** Stale config warning: holds the StaleConfigResult when a stamp-checked write detects conflict */
  const [staleConfigResult, setStaleConfigResult] = useState<import("../../../shared/ipc").StaleConfigResult | null>(null);
  /** The environment ID pending a set-main-VM when a stale conflict occurred */
  const [staleConfigEnvId, setStaleConfigEnvId] = useState<string | null>(null);
  /** The currently viewed chat session id (drives active-session highlighting in sidebar) */
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  /** All chat sessions — loaded from config store for header rendering */
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  /** Tracks the previous persisted state per session to detect auto-persist transitions */
  const [prevPersistedState, setPrevPersistedState] = useState<Record<string, boolean>>({});
  /** Models per environment (keyed by environmentId) */
  const [envModels, setEnvModels] = useState<Record<string, ModelInfo[]>>({});
  /** Settings panel open state */
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  /** Instance settings panel: which environment is being edited */
  const [instanceSettingsEnvId, setInstanceSettingsEnvId] = useState<string | null>(null);
  /** Global settings (loaded from config store) */
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    theme: "dark",
    defaultAgentRuntime: "opencode",
    configHomeVmId: null,
    ephemeralThresholdHours: 4,
  });

  // Load sessions on mount and when activeSessionId changes
  useEffect(() => {
    void configService.getChatSessions().then((s) => {
      // Detect auto-persist transitions (session was ephemeral, now persisted)
      setPrevPersistedState((prev) => {
        const next: Record<string, boolean> = {};
        for (const session of s) {
          next[session.id] = session.persisted ?? false;
        }
        return next;
      });
      setSessions(s);
    });
  }, [configService, activeSessionId]);

  // Load global settings on mount
  useEffect(() => {
    if (isMock) {
      // In mock mode, read from localStorage or use defaults
      try {
        const stored = localStorage.getItem("orbion.globalSettings");
        if (stored) {
          setGlobalSettings(JSON.parse(stored) as GlobalSettings);
        }
      } catch {
        // Ignore parse errors, use defaults
      }
      return;
    }
    void window.api.settings.getSettings().then((s) => {
      setGlobalSettings(s);
    });
  }, []);

  // Apply theme to document root
  useEffect(() => {
    const apply = (theme: GlobalSettings["theme"]) => {
      const resolved =
        theme === "system"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : theme;
      document.documentElement.setAttribute("data-theme", resolved);
    };

    apply(globalSettings.theme);

    if (globalSettings.theme !== "system") return;

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => apply("system");
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [globalSettings.theme]);

  // Load models for the active session's environment
  useEffect(() => {
    if (!activeSessionId) return;
    const session = sessions.find((s) => s.id === activeSessionId);
    if (!session) return;
    const envId = session.environmentId;
    if (envModels[envId]) return; // already loaded
    let cancelled = false;
    void agentService.listModels(envId).then((result) => {
      if (cancelled) return;
      if (result.ok && result.models) {
        setEnvModels((prev) =>
          prev[envId] ? prev : { ...prev, [envId]: result.models! },
        );
      }
    });
    return () => { cancelled = true; };
  }, [activeSessionId, sessions, agentService, envModels]);

  // ── Ephemeral session discard-on-leave ──────────────────────────────
  // When the user navigates away from an ephemeral session, show a discard
  // toast with an "Undo" button. If undo is not clicked within 5s, delete
  // the session and its transcript.
  //
  // SIDE-EFFECT PERMANENCE INVARIANT: discarding a chat ONLY removes local
  // session metadata and transcript. It NEVER rolls back side effects that
  // were executed on the loop-task daemon (loops created, chain edits
  // applied, etc.). Those effects live on the daemon, not in Orbion's
  // local state, and remain intact regardless of whether the chat that
  // caused them is kept or discarded.
  const prevViewRef = useRef<View>(view);
  const pendingDiscardRef = useRef<string | null>(null);

  useEffect(() => {
    const prevView = prevViewRef.current;
    prevViewRef.current = view;

    // Detect leaving an ephemeral session
    if (
      prevView.kind === "session" &&
      (view.kind !== "session" || view.sessionId !== prevView.sessionId)
    ) {
      const leftSessionId = prevView.sessionId;
      const leftSession = sessions.find((s) => s.id === leftSessionId);

      if (leftSession && !leftSession.persisted) {
        // If there's a previous pending discard, finalize it immediately
        if (pendingDiscardRef.current && pendingDiscardRef.current !== leftSessionId) {
          const previousId = pendingDiscardRef.current;
          void configService.removeChatSession(previousId);
          void transcriptService.deleteSession(previousId);
        }

        pendingDiscardRef.current = leftSessionId;

        showToast({
          message: intl.formatMessage({ id: "session.discardToast" }),
          action: {
            label: intl.formatMessage({ id: "session.discardUndo" }),
            onClick: () => {
              // Navigate back to the session (it wasn't deleted yet)
              pendingDiscardRef.current = null;
              setActiveSessionId(leftSessionId);
              setView({ kind: "session", sessionId: leftSessionId });
            },
          },
          duration: 5000,
          onDismissed: () => {
            // Timer expired without undo — delete the session
            if (pendingDiscardRef.current === leftSessionId) {
              void configService.removeChatSession(leftSessionId);
              void transcriptService.deleteSession(leftSessionId);
              pendingDiscardRef.current = null;
              // Refresh sessions list
              void configService.getChatSessions().then((s) => setSessions(s));
            }
          },
        });
      }
    }
  }, [view, sessions, configService, transcriptService, intl, showToast]);

  // ── Inactivity sweep for ephemeral sessions ──────────────────────────
  // Runs every 30 minutes. Removes ephemeral sessions whose lastActiveAt
  // exceeds 4 hours, but never the currently active session.
  const SWEEP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
  const SWEEP_INACTIVITY_HOURS = globalSettings.ephemeralThresholdHours;

  useEffect(() => {
    const sweep = async (): Promise<void> => {
      try {
        const result = await configService.sweepEphemeralSessions({
          activeSessionId,
          inactivityThresholdHours: SWEEP_INACTIVITY_HOURS,
        });
        if (result.removedSessionIds.length > 0) {
          // If a pending discard toast was for a swept session, clear it
          if (pendingDiscardRef.current && result.removedSessionIds.includes(pendingDiscardRef.current)) {
            pendingDiscardRef.current = null;
          }
          // Refresh sessions list
          void configService.getChatSessions().then((s) => setSessions(s));
        }
      } catch {
        // Best-effort: don't block the UI on sweep failure
      }
    };

    const timer = setInterval(sweep, SWEEP_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [configService, activeSessionId]);

  const { isUnread, markVisited } = useUnreadTracker();

  // Deep-link navigation handler for notification clicks
  const handleNotificationNavigate = useCallback((deepLink: DeepLinkTarget) => {
    switch (deepLink.kind) {
      case "loop":
        select(deepLink.environmentId);
        setView({ kind: "loop", loopId: deepLink.loopId });
        break;
      case "instance":
        select(deepLink.environmentId);
        setView({ kind: "instance" });
        break;
      case "inbox-item":
        select(deepLink.environmentId);
        // Navigate to the inbox view to show the item
        setView({ kind: "inbox" });
        break;
    }
  }, [select]);

  const { notificationService, sendInboxNotification } = useNativeNotifications(handleNotificationNavigate);

  const [globalMuted, setGlobalMuted] = useState(false);

  // Load mute state on mount
  useEffect(() => {
    let cancelled = false;
    void notificationService.isMuted().then((muted) => {
      if (!cancelled) setGlobalMuted(muted);
    });
    return () => { cancelled = true; };
  }, [notificationService]);

  // Load inbox dismissed IDs on mount
  useEffect(() => {
    let cancelled = false;
    void inboxService.getDismissedIds().then((ids) => {
      if (!cancelled) setInboxDismissedIds(new Set(ids));
    });
    return () => { cancelled = true; };
  }, [inboxService]);

  // Subscribe to review mode state changes
  useEffect(() => {
    const unsub = reviewModeService.onStateChange((item) => {
      setReviewModeItem(item);
    });
    return unsub;
  }, [reviewModeService]);

  const handleToggleGlobalMute = useCallback(() => {
    const next = !globalMuted;
    setGlobalMuted(next);
    void notificationService.setMuted(next);
  }, [globalMuted, notificationService]);

  // Budget watch — breach detection and notifications
  const handleBudgetBreach = useCallback((breach: BudgetBreach) => {
    void sendInboxNotification({
      environmentId: breach.environmentId,
      environmentName: breach.environmentName,
      itemId: breach.loopId,
      itemType: "loop",
      status: "failed",
      message: standaloneIntl.formatMessage(
        { id: "budget.breachNotification" },
        { loopName: breach.loopDescription, threshold: breach.threshold, count: breach.runsToday, autoPause: breach.autoPaused },
      ),
    });
  }, [sendInboxNotification]);

  const budgetWatch = useBudgetWatch(perEnvLoops, environments, handleBudgetBreach);

  // Loop state transition detection for inbox notifications
  const handleLoopTransition = useCallback((transition: LoopTransition) => {
    const env = environments.find((e) => e.id === transition.environmentId);
    if (!env) return;
    if (mutedEnvs.has(transition.environmentId)) return;

    const isFailed = transition.lastExitCode !== null && transition.lastExitCode !== 0;
    const type = isFailed ? "failure" : "finished";

    void sendInboxNotification({
      environmentId: transition.environmentId,
      environmentName: env.name,
      itemId: transition.loopId,
      itemType: "loop",
      status: type === "failure" ? "failed" : "completed",
      message: standaloneIntl.formatMessage(
        { id: type === "failure" ? "inbox.transitionFailed" : "inbox.transitionFinished" },
        { loopName: transition.loopDescription, exitCode: transition.lastExitCode, maxRuns: transition.maxRuns, runCount: transition.runCount },
      ),
    });
  }, [environments, mutedEnvs, sendInboxNotification]);

  useLoopTransitions(perEnvLoops, handleLoopTransition);

  // Outage escalation tracking
  const [escalatedOutages, setEscalatedOutages] = useState<Map<string, OutageEscalation>>(new Map());

  // Reachability state (its own health layer, separate from loop status)
  const [reachability, setReachability] = useState<Record<string, ReachabilityState>>({});

  // Load existing escalations on mount and subscribe to live events
  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      const escalations = await outageService.getEscalations();
      if (cancelled) return;
      setEscalatedOutages(new Map(escalations.map((e) => [e.environmentId, e])));
    };

    void load();

    const unsubEscalation = outageService.onEscalation((event) => {
      if (cancelled) return;
      setEscalatedOutages((prev) => {
        const next = new Map(prev);
        next.set(event.environmentId, event);
        return next;
      });
    });

    const unsubResolve = outageService.onResolve((environmentId) => {
      if (cancelled) return;
      setEscalatedOutages((prev) => {
        const next = new Map(prev);
        next.delete(environmentId);
        return next;
      });
    });

    return () => {
      cancelled = true;
      unsubEscalation();
      unsubResolve();
    };
  }, [outageService]);

  // Subscribe to reachability state changes (its own health layer)
  useEffect(() => {
    const unsub = reachabilityService.onStatusChange(
      (status) => {
        setReachability((prev) =>
          prev[status.environmentId] === status.state
            ? prev
            : { ...prev, [status.environmentId]: status.state },
        );
      },
    );
    return unsub;
  }, [reachabilityService]);

  // Load initial reachability state on mount
  useEffect(() => {
    if (isMock || environments.length === 0) return;
    let cancelled = false;

    const load = async (): Promise<void> => {
      const all = await reachabilityService.getAll();
      if (cancelled) return;
      const map: Record<string, ReachabilityState> = {};
      for (const s of all) {
        map[s.environmentId] = s.state;
      }
      setReachability((prev) => {
        // Only update if anything changed
        for (const [k, v] of Object.entries(map)) {
          if (prev[k] !== v) return map;
        }
        return prev;
      });
    };

    void load();
    return () => { cancelled = true; };
  }, [environments, reachabilityService]);

  // Start PR polling and subscribe to PR list updates
  useEffect(() => {
    prPollingService.startPolling();
    const unsub = prPollingService.onPrsUpdate((prs) => {
      setPrAwaitingReview(prs);
      // Trigger verdict sync for any PRs missing verdicts or with changed headSha
      prVerdictService.syncVerdicts(prs);
    });
    const unsubVerdicts = prVerdictService.onVerdictsUpdate(() => {
      // Rebuild the verdict map from the service cache
      setPrVerdicts((prev) => {
        const next = new Map(prev);
        let changed = false;
        for (const pr of prPollingService.getPrs()) {
          const key = `${pr.repo}:${pr.number}`;
          const v = prVerdictService.getVerdict(pr.repo, pr.number);
          if (v && (!next.has(key) || next.get(key) !== v)) {
            next.set(key, v);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    });
    return () => {
      prPollingService.stopPolling();
      unsub();
      unsubVerdicts();
    };
  }, [prPollingService, prVerdictService]);

  // Compute inbox build params early — used by the digest notification effect
  // below and the sidebar badge count further down. Must be declared before
  // any effect that references it to avoid temporal-dead-zone errors.
  const inboxBuildParams = useMemo<InboxBuildParams>(() => ({
    perEnvLoops,
    perEnvHealth: health,
    environments,
    breaches: budgetWatch.breaches,
    dismissedIds: inboxDismissedIds,
    escalatedOutages,
    prAwaitingReview,
    mainVmEnvironmentId: mainVm?.id ?? null,
    mainVmEnvironmentName: mainVm?.name ?? "",
    prVerdicts,
  }), [perEnvLoops, health, environments, budgetWatch.breaches, inboxDismissedIds, escalatedOutages, prAwaitingReview, mainVm, prVerdicts]);

  // Fire a single OS notification when a new PR digest appears
  const prevDigestIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const digestItems = inboxService.buildItems(inboxBuildParams).filter((i) => i.kind === "digest");
    const currentIds = new Set(digestItems.map((d) => d.id));

    // Find newly appeared digests
    for (const digest of digestItems) {
      if (!prevDigestIdsRef.current.has(digest.id)) {
        // New digest — fire a single OS notification
        const counts = digest.digestCounts;
        if (!globalMuted && counts) {
          void notificationService.send({
            title: standaloneIntl.formatMessage(
              { id: "inbox.digest.notifTitle" },
              { count: counts.total },
            ),
            body: standaloneIntl.formatMessage(
              { id: "inbox.digest.notifBody" },
              { safe: counts.safe, needsYou: counts.needsYou, conflict: counts.conflict },
            ),
            tag: digest.id,
            deepLink: { kind: "inbox-item", environmentId: digest.environmentId, itemKind: "digest", itemId: digest.id },
            suppressIfFocused: true,
          });
        }
      }
    }

    prevDigestIdsRef.current = currentIds;
  }, [inboxBuildParams, inboxService, notificationService, globalMuted]);

  const selected: Environment | null = environments.find((e) => e.id === selectedId) ?? null;

  useEffect(() => {
    const unsub = connectionService.onStatusChange(
      (environmentId: string, status: ConnectionStatus) => {
        const h = phaseToHealth(status.phase);
        setHealth((prev) => (prev[environmentId] === h ? prev : { ...prev, [environmentId]: h }));
        setConnectionStatus((prev) =>
          prev[environmentId] === status ? prev : { ...prev, [environmentId]: status },
        );
      },
    );
    return unsub;
  }, [connectionService]);

  useEffect(() => {
    const unsub = connectionService.onEndpointHealthChange(
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
  }, [connectionService]);

  useEffect(() => {
    const unsub = openCodeService.onStatusChange(
      (environmentId: string, status: OpenCodeConnectionStatus) => {
        setOpenCodeStatus((prev) =>
          prev[environmentId] === status ? prev : { ...prev, [environmentId]: status },
        );
      },
    );
    return unsub;
  }, [openCodeService]);

  useEffect(() => {
    if (isMock || environments.length === 0) return;
    let cancelled = false;

    const fetchAll = async (): Promise<void> => {
      for (const env of environments) {
        const status = await connectionService.getStatus(env.id);
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
        const status = await openCodeService.getStatus(env.id);
        if (cancelled) return;
        setOpenCodeStatus((prev) =>
          prev[env.id] === status ? prev : { ...prev, [env.id]: status },
        );
      }
    };

    void fetchAll();
    void fetchOpenCode();
    return () => { cancelled = true; };
  }, [environments, connectionService, openCodeService]);

  // Periodic OpenCode status refresh for runtime health chip (every 30s)
  useEffect(() => {
    if (isMock || !selected) return;
    if (!selected.opencode) return;
    const connStatus = connectionStatus[selected.id];
    if (connStatus && connStatus.phase !== "connected") return;

    let cancelled = false;
    const refresh = async (): Promise<void> => {
      const status = await openCodeService.refreshStatus(selected.id);
      if (cancelled) return;
      setOpenCodeStatus((prev) =>
        prev[selected.id] === status ? prev : { ...prev, [selected.id]: status },
      );
    };

    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selected?.id, selected?.opencode, connectionStatus[selected?.id ?? ""]?.phase, openCodeService]);

  useEffect(() => {
    const report = (): void => {
      connectionService.notifyNetworkChanged(navigator.onLine);
    };

    window.addEventListener("online", report);
    window.addEventListener("offline", report);
    report();

    return () => {
      window.removeEventListener("online", report);
      window.removeEventListener("offline", report);
    };
  }, [connectionService]);

  const fleetStatus = useMemo<Record<string, FleetItemStatus>>(() => {
    const result: Record<string, FleetItemStatus> = {};
    for (const env of environments) {
      const envLoops = perEnvLoops[env.id] ?? [];
      const envReachability = reachability[env.id];
      const childStatuses: FleetItemStatus[] = envLoops.map((l) =>
        loopStatusToFleetItem(l.status, l.lastExitCode, envReachability),
      );
      result[env.id] = rollUpEnvironmentStatus(childStatuses);
    }
    return result;
  }, [environments, perEnvLoops, reachability]);

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

  // Compute inbox item count for the sidebar badge
  const inboxItemCount = useMemo(() => inboxService.buildItems(inboxBuildParams).length, [inboxService, inboxBuildParams]);

  const prevFleetStatus = useRef<Record<string, FleetItemStatus>>({});
  useEffect(() => {
    for (const env of environments) {
      const current = fleetStatus[env.id];
      const prev = prevFleetStatus.current[env.id];
      if (current !== prev && isNotifiableStatus(current) && prev !== undefined) {
        if (!mutedEnvs.has(env.id)) {
          void sendInboxNotification({
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
  }, [fleetStatus, environments, sendInboxNotification, mutedEnvs]);

  const handleToggleMute = useCallback((environmentId: string) => {
    setMutedEnvs((prev) => {
      const next = new Set(prev);
      if (next.has(environmentId)) next.delete(environmentId);
      else next.add(environmentId);
      return next;
    });
  }, []);

  // Stable keys for per-environment polling effect dependencies
  const envEndpointsKey = useMemo(
    () => environments.map((e) => `${e.id}:${e.activeEndpointId ?? ""}`).join(","),
    [environments],
  );
  const envPhasesKey = useMemo(
    () => environments.map((e) => connectionStatus[e.id]?.phase ?? "unknown").join(","),
    [environments, connectionStatus],
  );

  // ── Per-instance loop polling (every ~5s) ──────────────────────────────
  // Poll loops from every connected instance's API. Polling pauses for
  // unreachable instances (skipped on each tick) and resumes automatically
  // on recovery. All data flows through perEnvLoops, which the bar, cards,
  // and rollups all read.
  useEffect(() => {
    if (environments.length === 0) {
      setLoops([]);
      return;
    }

    // Build the connected-env snapshot for this tick
    const connectedEnvs = environments.filter(
      (env) => connectionStatus[env.id]?.phase === "connected",
    );

    if (connectedEnvs.length === 0) {
      if (selected) setLoops([]);
      return;
    }

    let cancelled = false;

    const pollAll = async (): Promise<void> => {
      for (const env of connectedEnvs) {
        if (cancelled) return;
        const res = await fetchLoops(env);
        if (cancelled) return;
        if (res.ok && Array.isArray(res.data)) {
          const loopData = res.data as LoopMeta[];
          setPerEnvLoops((prev) => ({ ...prev, [env.id]: loopData }));
          // Update the selected-env fast path
          if (env.id === selectedId) {
            setLoops(loopData);
            setLastUpdated(Date.now());
          }
        }
      }
    };

    void pollAll();
    const timer = setInterval(() => void pollAll(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    envEndpointsKey,
    selectedId,
    envPhasesKey,
  ]);

  // When the selected environment has no data yet (e.g. it was unreachable and
  // just became connected), derive loops from perEnvLoops so the UI updates
  // immediately without waiting for the next poll tick.
  useEffect(() => {
    if (!selectedId) {
      setLoops([]);
      return;
    }
    const envLoops = perEnvLoops[selectedId];
    if (envLoops) {
      setLoops(envLoops);
      setLastUpdated(Date.now());
    } else {
      const connStatus = connectionStatus[selectedId];
      if (!connStatus || connStatus.phase !== "connected") {
        setLoops([]);
      }
    }
  }, [selectedId, selectedId ? perEnvLoops[selectedId]?.length : undefined, selectedId ? connectionStatus[selectedId]?.phase : undefined]);

  // ── Per-instance project polling (every ~10s) ─────────────────────────
  useEffect(() => {
    if (environments.length === 0) return;

    const connectedEnvs = environments.filter(
      (env) => connectionStatus[env.id]?.phase === "connected",
    );
    if (connectedEnvs.length === 0) return;

    let cancelled = false;

    const pollAll = async (): Promise<void> => {
      for (const env of connectedEnvs) {
        if (cancelled) return;
        const res = await fetchProjects(env);
        if (cancelled) return;
        if (res.ok && Array.isArray(res.data)) {
          setPerEnvProjects((prev) => ({ ...prev, [env.id]: res.data as Project[] }));
        }
      }
    };

    void pollAll();
    const timer = setInterval(() => void pollAll(), 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    envEndpointsKey,
    envPhasesKey,
  ]);

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
    setView({ kind: "instance" });
  };

  const handleNavigate = useCallback((newView: View): void => {
    setView(newView);
  }, []);

  const handleRetry = useCallback((id: string): void => {
    void connectionService.retry(id);
  }, [connectionService]);

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
    void reload().then(async () => {
      handleSelect(_environmentId);
      // After the first VM is added, check if a config restore is available
      try {
        const availability = await configService.checkRestoreAvailable();
        if (availability.available) {
          setRestoreAvailability(availability);
          setRestoreOfferOpen(true);
        }
      } catch {
        // Restore check is best-effort; don't block the user
      }
    });
  };

  const openLoop = (loopId: string): void => setView({ kind: "loop", loopId });
  const openProject = (projectId: string): void => setView({ kind: "project", projectId });

  const handlePullRestore = useCallback(async (): Promise<PullRestoreResult> => {
    const result = await configService.pullRestore();
    if (result.ok) {
      await reload();
      // Select the first restored environment
      if (result.restored.length > 0) {
        handleSelect(result.restored[0].id);
      }
      setRestoreOfferOpen(false);
      setRestoreAvailability(null);
    }
    return result;
  }, [configService, reload, handleSelect]);

  const handleSkipRestore = useCallback((): void => {
    setRestoreOfferOpen(false);
    setRestoreAvailability(null);
  }, []);

  /** Stamp-checked set-main-VM: writes only if config is not stale. Shows stale warning on conflict. */
  const handleStampCheckedSetMainVm = useCallback(async (environmentId: string): Promise<void> => {
    const result = await stampCheckedSetMainVm(environmentId);
    if (!result.ok && result.stale) {
      setStaleConfigResult(result.stale);
      setStaleConfigEnvId(environmentId);
    }
  }, [stampCheckedSetMainVm]);

  /** Pull-remote from the config-home VM as stale resolution. */
  const handleStalePullRemote = useCallback(async (): Promise<import("../../../shared/ipc").PullRestoreResult> => {
    const result = await configService.pullRestore();
    if (result.ok) {
      await reload();
      // After pull-restore, apply the originally intended set-main-VM
      if (staleConfigEnvId) {
        void forceSetMainVm(staleConfigEnvId);
      }
      setStaleConfigResult(null);
      setStaleConfigEnvId(null);
    }
    return result;
  }, [configService, reload, forceSetMainVm, staleConfigEnvId]);

  /** Force-write the set-main-VM despite staleness (last-write-wins with explicit consent). */
  const handleStaleOverwriteAnyway = useCallback(async (): Promise<void> => {
    if (staleConfigEnvId) {
      await forceSetMainVm(staleConfigEnvId);
    }
    setStaleConfigResult(null);
    setStaleConfigEnvId(null);
  }, [forceSetMainVm, staleConfigEnvId]);

  /** Dismiss the stale config warning without taking action. */
  const handleStaleCancel = useCallback((): void => {
    setStaleConfigResult(null);
    setStaleConfigEnvId(null);
  }, []);

  const handleNavigateToSession = useCallback((sessionId: string): void => {
    setActiveSessionId(sessionId);
    setView({ kind: "session", sessionId });
  }, []);

  /** Handle runtime switch in a chat session: persist the change and add a transcript note. */
  const handleRuntimeSwitch = useCallback((sessionId: string, newRuntime: AgentRuntime): void => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session || session.activeRuntime === newRuntime) return;

    const runtimeLabel = newRuntime === "opencode"
      ? intl.formatMessage({ id: "agentSwitcher.opencode" })
      : intl.formatMessage({ id: "agentSwitcher.claude" });

    // Persist the runtime change
    void configService.updateChatSession(sessionId, { activeRuntime: newRuntime });
    // Add a transcript note about the switch
    void transcriptService.appendMessage({
      id: `runtime-switch-${Date.now()}`,
      sessionId,
      role: "assistant",
      content: intl.formatMessage({ id: "agentSwitcher.switchedRuntime" }, { runtime: runtimeLabel }),
      startedAt: Date.now(),
      finishedAt: Date.now(),
    });
    // Refresh sessions in local state
    void configService.getChatSessions().then((s) => setSessions(s));
  }, [sessions, configService, transcriptService, intl]);

  /** Handle model switch in a chat session: persist the change and add a transcript note. */
  const handleModelSwitch = useCallback((sessionId: string, newModelId: string): void => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session || session.activeModel === newModelId) return;

    // Find the model label from envModels
    const sessionModels = envModels[session.environmentId] ?? [];
    const model = sessionModels.find((m) => m.id === newModelId);
    const modelLabel = model?.label ?? newModelId;

    // Persist the model change; clear reasoning effort if the new model doesn't support the current one
    const newModelEfforts = model?.reasoningEfforts;
    const currentEffort = session.reasoningEffort;
    const shouldClearEffort = currentEffort && newModelEfforts && !newModelEfforts.includes(currentEffort);
    const updates: Partial<Pick<ChatSession, "activeModel" | "reasoningEffort">> = { activeModel: newModelId };
    if (shouldClearEffort) {
      updates.reasoningEffort = undefined;
    }
    void configService.updateChatSession(sessionId, updates);
    // Add a transcript note about the switch
    void transcriptService.appendMessage({
      id: `model-switch-${Date.now()}`,
      sessionId,
      role: "assistant",
      content: intl.formatMessage({ id: "modelSelector.switchedModel" }, { model: modelLabel }),
      startedAt: Date.now(),
      finishedAt: Date.now(),
    });
    // Refresh sessions in local state
    void configService.getChatSessions().then((s) => setSessions(s));
  }, [sessions, configService, transcriptService, intl, envModels]);

  /** Handle reasoning effort change in a chat session: persist the change. */
  const handleReasoningEffortChange = useCallback((sessionId: string, effort: ReasoningEffort): void => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session || session.reasoningEffort === effort) return;

    void configService.updateChatSession(sessionId, { reasoningEffort: effort });
    // Refresh sessions in local state
    void configService.getChatSessions().then((s) => setSessions(s));
  }, [sessions, configService]);

  /** Handle instance switch in a chat session: interrupt, persist, add handoff divider, reconnect MCP. */
  const handleInstanceSwitch = useCallback((sessionId: string, newEnvironmentId: string, newWorkingDirectory: string | undefined): void => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session || session.environmentId === newEnvironmentId) return;

    const oldEnv = environments.find((e) => e.id === session.environmentId);
    const newEnv = environments.find((e) => e.id === newEnvironmentId);
    const oldInstanceName = oldEnv?.name ?? session.environmentId;
    const newInstanceName = newEnv?.name ?? newEnvironmentId;

    // Step 1: Interrupt any in-flight generation on the old instance
    void agentService.interrupt(session.environmentId).catch(() => {
      // Interrupt may fail if the old instance is unreachable; proceed anyway
    });

    // Step 2: Persist the instance change
    const updates: Partial<Pick<ChatSession, "environmentId" | "workingDirectory">> = {
      environmentId: newEnvironmentId,
    };
    if (newWorkingDirectory) {
      updates.workingDirectory = newWorkingDirectory;
    }
    void configService.updateChatSession(sessionId, updates);

    // Step 3: Add a handoff divider message with from/to instance names
    void transcriptService.appendMessage({
      id: `instance-switch-${Date.now()}`,
      sessionId,
      role: "assistant",
      content: intl.formatMessage(
        { id: "instanceSelector.switchedInstance" },
        { fromInstance: oldInstanceName, toInstance: newInstanceName },
      ),
      startedAt: Date.now(),
      finishedAt: Date.now(),
      environmentId: newEnvironmentId,
    });

    // Step 4: Refresh MCP tools on the new instance
    void mcpService.connect(newEnvironmentId).catch(() => {
      // MCP connect failure is surfaced via the MCP status chip; proceed
    });

    // Step 5: Refresh sessions in local state
    void configService.getChatSessions().then((s) => setSessions(s));
  }, [sessions, environments, configService, transcriptService, agentService, mcpService, intl]);

  /** Move a chat session to a different project (re-files it in the sidebar). */
  const handleMoveSessionToProject = useCallback((sessionId: string, targetProjectName: string): void => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;

    // Check if the current instance has the target project
    const currentEnvProjects = perEnvProjects[session.environmentId] ?? [];
    const currentInstanceHasProject = currentEnvProjects.some((p) => p.name === targetProjectName);

    if (currentInstanceHasProject) {
      // Simple case: just update the project name, keep the same instance
      void configService.updateChatSession(sessionId, {
        projectName: targetProjectName,
      });
    } else {
      // Need to find an instance that has the target project
      const targetEnv = environments.find((env) => {
        const envProjects = perEnvProjects[env.id] ?? [];
        return envProjects.some((p) => p.name === targetProjectName);
      });

      if (!targetEnv) {
        // No instance has this project — show error toast
        showToast({
          message: intl.formatMessage(
            { id: "sidebar.moveToProjectUnavailable" },
            { project: targetProjectName },
          ),
        });
        return;
      }

      // Derive working directory from the target project's loops on the new instance
      const targetEnvLoops = perEnvLoops[targetEnv.id] ?? [];
      const targetEnvProjects = perEnvProjects[targetEnv.id] ?? [];
      const targetProject = targetEnvProjects.find((p) => p.name === targetProjectName);
      const projectLoops = targetProject
        ? targetEnvLoops.filter((l) => (l.projectId ?? "default") === targetProject.id)
        : [];
      const newWorkingDirectory = projectLoops.length > 0
        ? projectLoops[0].cwd
        : `~/${targetProjectName}`;

      void configService.updateChatSession(sessionId, {
        projectName: targetProjectName,
        environmentId: targetEnv.id,
        workingDirectory: newWorkingDirectory,
      });

      // If the moved session is the active one, update the active env selection
      if (sessionId === activeSessionId) {
        select(targetEnv.id);
      }
    }

    // Refresh sessions in local state
    void configService.getChatSessions().then((s) => setSessions(s));

    // Show confirmation toast
    showToast({
      message: intl.formatMessage(
        { id: "sidebar.sessionMoved" },
        { project: targetProjectName },
      ),
      duration: 3000,
    });
  }, [sessions, environments, perEnvProjects, perEnvLoops, configService, intl, showToast, activeSessionId, select]);

  /** Persist an ephemeral (scratch) session so it appears in the sidebar. */
  const handlePersistSession = useCallback((sessionId: string): void => {
    void configService.updateChatSession(sessionId, { persisted: true });
    // Refresh sessions in local state
    void configService.getChatSessions().then((s) => setSessions(s));
  }, [configService]);

  /** Un-persist a session (make it ephemeral again) — requires confirmation. */
  const [confirmUnpersistId, setConfirmUnpersistId] = useState<string | null>(null);

  const handleUnpersistSession = useCallback((sessionId: string): void => {
    void configService.updateChatSession(sessionId, { persisted: false });
    setConfirmUnpersistId(null);
    // Refresh sessions in local state
    void configService.getChatSessions().then((s) => setSessions(s));
  }, [configService]);

  /** Auto-persist: when a configurable turn-count threshold is crossed, persist the session. */
  const AUTO_PERSIST_TURN_THRESHOLD = 8;

  const handleTurnCountChange = useCallback((sessionId: string, turnCount: number): void => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    // Already persisted — nothing to do
    if (session.persisted) return;
    // Check decline suppression
    if (session.declineAutoPersistUntil) {
      const declineUntil = new Date(session.declineAutoPersistUntil).getTime();
      if (Date.now() < declineUntil) return;
    }
    // Update turn count on the session
    void configService.updateChatSession(sessionId, { turnCount });
    // Crossed threshold?
    if (turnCount >= AUTO_PERSIST_TURN_THRESHOLD && (session.turnCount ?? 0) < AUTO_PERSIST_TURN_THRESHOLD) {
      void configService.updateChatSession(sessionId, { persisted: true });
      // Refresh sessions in local state
      void configService.getChatSessions().then((s) => setSessions(s));
    }
  }, [configService, sessions]);

  /** Decline auto-persist offer — remember for this session. */
  const handleDeclineAutoPersist = useCallback((sessionId: string): void => {
    // Suppress for 24 hours
    const declineUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    void configService.updateChatSession(sessionId, { declineAutoPersistUntil: declineUntil });
  }, [configService]);

  /** Update global settings and persist to config store. */
  const handleUpdateGlobalSettings = useCallback((updates: Partial<GlobalSettings>) => {
    setGlobalSettings((prev) => {
      const next = { ...prev, ...updates };
      if (isMock) {
        try {
          localStorage.setItem("orbion.globalSettings", JSON.stringify(next));
        } catch {
          // Ignore localStorage errors in mock mode
        }
      } else {
        void window.api.settings.updateSettings(updates);
      }
      return next;
    });
  }, []);

  /** Determine if auto-persist just happened for a session (was ephemeral, now persisted, not via user toggle). */
  const getAutoPersistedJustNow = useCallback((sessionId: string): boolean => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return false;
    const wasEphemeral = prevPersistedState[sessionId] === false;
    const isNowPersisted = session.persisted === true;
    return wasEphemeral && isNowPersisted;
  }, [sessions, prevPersistedState]);

  const updatedLabel =
    lastUpdated === null ? "..." : timeAgo(new Date(lastUpdated).toISOString());

  const activeEndpoint = selected
    ? (selected.activeEndpointId
        ? selected.endpoints.find((ep) => ep.id === selected.activeEndpointId)
        : selected.endpoints[0])
    : null;

  // Determine what to render in the content area
  const renderContent = (): React.ReactNode => {
    // Inbox view is fleet-wide and accessible even without a selected environment
    if (view.kind === "inbox") {
      return (
        <InboxView
          perEnvLoops={perEnvLoops}
          perEnvHealth={health}
          environments={environments}
          perEnvProjects={perEnvProjects}
          breaches={budgetWatch.breaches}
          escalatedOutages={escalatedOutages}
          prAwaitingReview={prAwaitingReview}
          mainVmEnvironmentId={mainVm?.id ?? null}
          mainVmEnvironmentName={mainVm?.name ?? ""}
          prVerdicts={prVerdicts}
          onClickItem={(item) => {
            if (item.kind === "pr-awaiting-review" && item.prRepo && item.prNumber) {
              // Open review mode with the full batch of PRs
              const selectedIndex = prAwaitingReview.findIndex(
                (pr) => pr.repo === item.prRepo && pr.number === item.prNumber,
              );
              const batchItems = prAwaitingReview.map((pr) => {
                const verdictKey = `${pr.repo}:${pr.number}`;
                const verdict = prVerdicts.get(verdictKey);
                return {
                  repo: pr.repo,
                  number: pr.number,
                  title: pr.title,
                  author: pr.author,
                  url: pr.url,
                  headSha: pr.headSha,
                  verdict,
                };
              });
              reviewModeService.enterBatch(batchItems, selectedIndex >= 0 ? selectedIndex : 0);
              return;
            }
            select(item.environmentId);
            if (item.loopId) {
              setView({ kind: "loop", loopId: item.loopId });
            } else {
              setView({ kind: "instance" });
            }
          }}
          onDismissItem={(_itemId) => {
            // Dismissal is handled internally by InboxView
          }}
          onOpenInChat={(item) => {
            if (item.kind === "pr-awaiting-review" && item.prNumber && item.prRepo) {
              // Open a chat session scoped to the PR's project with a PR reference card inserted
              const envId = item.environmentId;
              const env = environments.find((e) => e.id === envId);
              const defaultRuntime = env?.agentRuntime ?? "opencode";
              const envModelList = envModels[envId] ?? [];
              const defaultModel = envModelList.find((m) => m.available)?.id;
              void configService
                .addChatSession({
                  title: `PR #${item.prNumber}: ${item.title}`,
                  projectName: "Default",
                  environmentId: envId,
                  workingDirectory: `~/${item.prRepo}`,
                  activeRuntime: defaultRuntime,
                  activeModel: defaultModel,
                  lastActiveAt: new Date().toISOString(),
                  persisted: true,
                })
                .then((newSession) => {
                  setActiveSessionId(newSession.id);
                  setView({ kind: "session", sessionId: newSession.id });
                  select(envId);
                  // Insert a PR reference card into the transcript after a brief delay
                  // to ensure the SessionChatView has mounted and the useTranscript hook is ready
                  setTimeout(() => {
                    void transcriptService.appendMessage({
                      id: `pr-ref-${Date.now()}`,
                      sessionId: newSession.id,
                      role: "user",
                      content: JSON.stringify({
                        kind: "pr-reference-card",
                        prNumber: item.prNumber,
                        prTitle: item.title ?? "",
                        prRepo: item.prRepo ?? "",
                        prAuthor: item.prAuthor ?? "",
                        prUrl: item.prUrl ?? "",
                        prVerdict: item.prVerdict,
                      }),
                      startedAt: Date.now(),
                      finishedAt: Date.now(),
                    }).then(() => {
                      // Trigger a reload so the useTranscript hook picks up the new message
                      // This is handled by the hook's loadedSessionRef reset
                    });
                  }, 100);
                });
            } else {
              select(item.environmentId);
              setView({ kind: "instance" });
            }
          }}
        />
      );
    }

    if (!selected) {
      return (
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
      );
    }

    switch (view.kind) {
      case "instance":
        return (
          <InstanceDetail
            instance={selected}
            loops={loops}
            connectionPhase={connectionStatus[selected.id]?.phase}
            reachability={reachability[selected.id]}
            onOpenLoop={openLoop}
            onOpenProject={openProject}
          />
        );
      case "project": {
        const projectList = perEnvProjects[selected.id] ?? [];
        const project = projectList.find((p) => p.id === view.projectId);
        const projectLoops = loops.filter((l) => (l.projectId ?? "default") === view.projectId);
        if (!project) {
          return (
            <div className="content-inner">
              <div className="empty">
                <h3>{intl.formatMessage({ id: "projectDetail.notFound" })}</h3>
              </div>
            </div>
          );
        }
        return (
          <ProjectDetail
            project={project}
            loops={projectLoops}
            reachability={reachability[selected.id]}
            onOpenLoop={openLoop}
          />
        );
      }
      case "loop":
        return (
          <LoopDetail
            instance={selected}
            loopId={view.loopId}
            initial={loops.find((l) => l.id === view.loopId) ?? null}
            reachability={reachability[selected.id]}
            onBack={() => setView({ kind: "instance" })}
          />
        );
      case "session": {
        const session = sessions.find((s) => s.id === view.sessionId);
        const sessionEnvId = session?.environmentId ?? selected?.id ?? "";
        const sessionEnv = environments.find((e) => e.id === sessionEnvId);

        // Determine if this session is un-homed (no project + no instance → fleet tier)
        const isUnhomed = !session?.projectName || !session?.environmentId;

        // Scope loops to the session's project x instance
        const projectName = session?.projectName;
        const envProjects = perEnvProjects[sessionEnvId] ?? [];
        const sessionProject = projectName
          ? envProjects.find((p) => p.name === projectName)
          : undefined;
        const sessionLoops = sessionProject
          ? (perEnvLoops[sessionEnvId] ?? []).filter((l) => (l.projectId ?? "default") === sessionProject.id)
          : perEnvLoops[sessionEnvId] ?? [];

        // Compute fleet rollup for un-homed sessions
        const fleetRollup: FleetLoopRollup | undefined = isUnhomed
          ? computeFleetRollup(perEnvLoops, environments, perEnvProjects, reachability)
          : undefined;

        return (
          <SessionChatView
            sessionId={view.sessionId}
            environmentId={sessionEnvId}
            environmentName={sessionEnv?.name ?? sessionEnvId}
            activeRuntime={session?.activeRuntime ?? "opencode"}
            model={session?.activeModel}
            reasoningEffort={session?.reasoningEffort}
            environments={environments.map((e) => ({ id: e.id, name: e.name }))}
            reachability={reachability[sessionEnvId]}
            loops={isUnhomed ? [] : sessionLoops}
            perEnvLoops={perEnvLoops}
            fleetReachability={reachability}
            perEnvProjects={perEnvProjects}
            instance={sessionEnv}
            isEphemeral={!session?.persisted}
            onPersistSession={() => handlePersistSession(view.sessionId)}
            turnCount={session?.turnCount}
            onTurnSent={() => handleTurnCountChange(view.sessionId, (session?.turnCount ?? 0) + 1)}
            autoPersistedJustNow={getAutoPersistedJustNow(view.sessionId)}
            onDeclineAutoPersist={() => handleDeclineAutoPersist(view.sessionId)}
            onUnpersistSession={() => setConfirmUnpersistId(view.sessionId)}
            fleetMode={isUnhomed}
            fleetRollup={fleetRollup}
            fleetLoopsWithOrigin={fleetRollup?.loopsWithOrigin}
            projectId={sessionProject?.id}
          />
        );
      }
    }
  };

  // Resolve detail header for project and loop views
  const renderDetailHeader = (): React.ReactNode => {
    if (!selected) return null;

    if (view.kind === "project") {
      const projectList = perEnvProjects[selected.id] ?? [];
      const project = projectList.find((p) => p.id === view.projectId);
      const projectLoops = loops.filter((l) => (l.projectId ?? "default") === view.projectId);
      return (
        <div className="main-header">
          <span className="dot" style={{ background: project?.color ?? "var(--text-muted)" }} />
          <span className="main-title">{project?.name ?? view.projectId}</span>
          <span className="chip">{intl.formatMessage({ id: "projectDetail.loopsCount" }, { count: projectLoops.length })}</span>
          <span style={{ flex: 1 }} />
        </div>
      );
    }

    if (view.kind === "loop") {
      const loop = loops.find((l) => l.id === view.loopId);
      const title = loop?.description?.trim() || loop?.id || view.loopId;
      return (
        <div className="main-header">
          <span className="main-title">{title}</span>
          {loop ? (
            <span
              className="chip"
              style={{ color: `var(--status-${loop.status})` }}
            >
              {intl.formatMessage({ id: `loopDetail.status${loop.status.charAt(0).toUpperCase()}${loop.status.slice(1)}` })}
            </span>
          ) : null}
          <span style={{ flex: 1 }} />
        </div>
      );
    }

    if (view.kind === "session") {
      // Find the active session to render its scoped header
      const session = sessions.find((s) => s.id === activeSessionId);
      if (session) {
        // Look up the project color from perEnvProjects using the session's home scope
        const envProjects = perEnvProjects[session.environmentId] ?? [];
        const project = envProjects.find((p) => p.name === session.projectName);
        const projectColor = project?.color ?? "var(--text-muted)";
        // Resolve the environment for the session's home instance
        const sessionEnv = environments.find((e) => e.id === session.environmentId);
        const instanceDefault = sessionEnv?.agentRuntime ?? "opencode";
        const sessionReachability = reachability[session.environmentId];
        const sessionRuntimeState = sessionEnv?.runtimeState;
        // Resolve model and reasoning effort for this session
        const sessionModels = envModels[session.environmentId] ?? [];
        const reasoningEfforts = getReasoningEffortsForModel(sessionModels, session.activeModel);
        return (
          <div className="main-header">
            <span className="dot" style={{ background: projectColor }} />
            <span className="main-title">{session.projectName}</span>
            {!session.persisted ? (
              <span
                className="chip chip-ephemeral chip-clickable"
                title={intl.formatMessage({ id: "session.ephemeralMarker" })}
                onClick={() => handlePersistSession(session.id)}
                role="button"
                tabIndex={0}
              >
                {intl.formatMessage({ id: "session.ephemeralMarker" })}
              </span>
            ) : (
              <span
                className="chip chip-persisted chip-clickable"
                title={intl.formatMessage({ id: "session.unpersistAction" })}
                onClick={() => setConfirmUnpersistId(session.id)}
                role="button"
                tabIndex={0}
              >
                {intl.formatMessage({ id: "session.persistedMarker" })}
              </span>
            )}
            {session.workingDirectory ? (
              <span className="chip mono session-directory" title={session.workingDirectory}>
                {session.workingDirectory}
              </span>
            ) : null}
            <InstanceSelector
              projectName={session.projectName}
              environments={environments}
              perEnvProjects={perEnvProjects}
              perEnvLoops={perEnvLoops}
              health={health}
              reachability={reachability}
              currentEnvironmentId={session.environmentId}
              mainVmId={mainVm?.id ?? null}
              onChange={(envId, workDir) => handleInstanceSwitch(session.id, envId, workDir)}
              onOpenSettings={(envId) => setInstanceSettingsEnvId(envId)}
            />
            <AgentRuntimeSwitcher
              value={session.activeRuntime}
              instanceDefault={instanceDefault}
              reachability={sessionReachability}
              runtimeState={sessionRuntimeState}
              onChange={(runtime) => handleRuntimeSwitch(session.id, runtime)}
            />
            <ModelSelector
              environmentId={session.environmentId}
              value={session.activeModel}
              onChange={(modelId) => handleModelSwitch(session.id, modelId)}
            />
            {reasoningEfforts ? (
              <ReasoningEffortSelector
                value={session.reasoningEffort}
                efforts={reasoningEfforts}
                onChange={(effort) => handleReasoningEffortChange(session.id, effort)}
              />
            ) : null}
            <span style={{ flex: 1 }} />
          </div>
        );
      }
      return (
        <div className="main-header">
          <span className="main-title">{intl.formatMessage({ id: "session.viewTitle" })}</span>
          <span style={{ flex: 1 }} />
        </div>
      );
    }

    return null;
  };

  // Main header for instance detail (existing header)
  const renderInstanceHeader = (): React.ReactNode => {
    if (!selected || view.kind !== "instance") return null;

    return (
      <div className="main-header">
        {/* Left group: name * IP * status dots */}
        <span className="main-title">{selected.name}</span>

        {activeEndpoint ? (() => {
          let label: string | null = null;
          if (activeEndpoint.sshTarget) {
            const m = /^[^@]+@([^:]+)(?::\d+)?$/.exec(activeEndpoint.sshTarget);
            label = m ? m[1] : activeEndpoint.sshTarget;
          } else {
            const h = hostLabel(activeEndpoint.url);
            if (!h.startsWith("127.0.0.1") && !h.startsWith("localhost")) {
              label = h;
            }
          }
          return label ? (
            <span className="chip mono" title={activeEndpoint.sshTarget ?? activeEndpoint.url}>
              {label}
            </span>
          ) : null;
        })() : null}

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

        {/* Runtime health chip */}
        <RuntimeHealthChip
          environment={selected}
          health={health[selected.id] ?? "unknown"}
          reachability={reachability[selected.id]}
          openCodeStatus={openCodeStatus[selected.id]}
          runtimeState={selected.runtimeState}
        />

        {/* Spacer */}
        <span style={{ flex: 1 }} />

        {/* Right group: meta * remove * mark-as-main */}
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
            onClick={() => { void handleStampCheckedSetMainVm(selected.id); }}
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
    );
  };

  // Cold-open: when no environments are configured and the store has loaded,
  // show only the centered welcome card — no sidebar, no loop UI, no chat.
  const isColdOpen = loaded && environments.length === 0;

  return (
    <div className="app">
      <div className="titlebar">
        {!isColdOpen ? (
          <button
            className="icon-btn"
            title={sidebarOpen ? intl.formatMessage({ id: "app.hideSidebar" }) : intl.formatMessage({ id: "app.showSidebar" })}
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <PanelLeft size={15} />
          </button>
        ) : null}
        <span className="titlebar-brand">
          <OrbionMark size={16} />
          {intl.formatMessage({ id: "app.brand" })}
        </span>
        <span className="titlebar-tag">{isMock ? intl.formatMessage({ id: "app.mock" }) : intl.formatMessage({ id: "app.preview" })}</span>
        <span style={{ flex: 1 }} />
        {!isColdOpen ? (
          <button
            className="icon-btn"
            title={globalMuted ? intl.formatMessage({ id: "app.unmuteNotifications" }) : intl.formatMessage({ id: "app.muteNotifications" })}
            onClick={handleToggleGlobalMute}
            style={{ opacity: globalMuted ? 1 : 0.5, color: globalMuted ? "var(--danger)" : "var(--text-secondary)" }}
          >
            {globalMuted ? <BellOff size={14} /> : <Bell size={14} />}
          </button>
        ) : null}
      </div>

      <div className="body">
        {isColdOpen ? (
          <div className="panel main-panel">
            <ColdOpen
              onAddVm={() => {
                setWizardSeed(null);
                setVmWizardOpen(true);
              }}
              onImportSeed={(seed) => {
                setWizardSeed(seed);
                setVmWizardOpen(true);
              }}
            />
          </div>
        ) : (
          <>
            {sidebarOpen ? (
              <aside className="panel sidebar-panel">
                <Sidebar
                  environments={environments}
                  selectedId={selectedId}
                  health={health}
                  connectionStatus={connectionStatus}
                  perEnvLoops={perEnvLoops}
                  perEnvProjects={perEnvProjects}
                  view={view}
                  reachability={reachability}
                  mainVmId={mainVm?.id ?? null}
                  onSelect={handleSelect}
                  onNavigate={handleNavigate}
                  onAddVm={() => {
                    setWizardSeed(null);
                    setVmWizardOpen(true);
                  }}
                  inboxItemCount={inboxItemCount}
                  onNavigateToLoop={(envId, loopId) => {
                    select(envId);
                    setView({ kind: "loop", loopId });
                  }}
                  onNavigateToProject={(envId, projectId) => {
                    select(envId);
                    setView({ kind: "project", projectId });
                  }}
                  onNavigateToInbox={() => {
                    setView({ kind: "inbox" });
                  }}
                  onNavigateToSession={handleNavigateToSession}
                  activeSessionId={activeSessionId}
                  sessions={sessions}
                  onOpenProjectChat={useCallback((projectName: string, environmentId: string, workingDirectory: string) => {
                    // Find or create a session for this project on this instance
                    const existing = sessions.find(
                      (s) => s.projectName === projectName && s.environmentId === environmentId,
                    );
                    if (existing) {
                      setActiveSessionId(existing.id);
                      setView({ kind: "session", sessionId: existing.id });
                      // Touch lastActiveAt
                      void configService.updateChatSession(existing.id, {
                        lastActiveAt: new Date().toISOString(),
                      });
                    } else {
                      // Derive the default runtime from the environment
                      const env = environments.find((e) => e.id === environmentId);
                      const defaultRuntime = env?.agentRuntime ?? "opencode";
                      // Pick the first available model from envModels
                      const envModelList = envModels[environmentId] ?? [];
                      const defaultModel = envModelList.find((m) => m.available)?.id;
                      void configService
                        .addChatSession({
                          title: `Project: ${projectName}`,
                          projectName,
                          environmentId,
                          workingDirectory,
                          activeRuntime: defaultRuntime,
                          activeModel: defaultModel,
                          lastActiveAt: new Date().toISOString(),
                          persisted: false,
                        })
                        .then((newSession) => {
                          setActiveSessionId(newSession.id);
                          setView({ kind: "session", sessionId: newSession.id });
                          select(environmentId);
                        });
                    }
                  }, [sessions, configService, select, environments])}
                  onMoveSessionToProject={handleMoveSessionToProject}
                  onOpenSettings={() => setSettingsPanelOpen(true)}
                />
              </aside>
            ) : null}

            <div className="panel main-panel" style={{ position: "relative" }}>
              {view.kind !== "inbox" ? renderInstanceHeader() : null}
              {view.kind !== "inbox" ? renderDetailHeader() : null}

              <div className={`content${view.kind === "inbox" ? " content-full" : ""}`}>
                {renderContent()}
              </div>

              {/* InfraChatPanel shows only on instance/project/loop views */}
              {view.kind !== "inbox" && selected && mainVm ? (
                <InfraChatPanel mainVmId={mainVm.id} mainVmName={mainVm.name} />
              ) : null}

              {/* PR review mode overlay */}
              {reviewModeItem ? (
                <ReviewModeOverlay
                  onDiscussInChat={(item) => {
                    // Exit review mode
                    reviewModeService.exit();
                    // Open a chat session scoped to the PR's project with a PR reference card inserted
                    const envId = mainVm?.id ?? item.repo;
                    const env = environments.find((e) => e.id === envId);
                    const defaultRuntime = env?.agentRuntime ?? "opencode";
                    const envModelList = envModels[envId] ?? [];
                    const defaultModel = envModelList.find((m) => m.available)?.id;
                    void configService
                      .addChatSession({
                        title: `PR #${item.number}: ${item.title}`,
                        projectName: "Default",
                        environmentId: envId,
                        workingDirectory: `~/${item.repo}`,
                        activeRuntime: defaultRuntime,
                        activeModel: defaultModel,
                        lastActiveAt: new Date().toISOString(),
                        persisted: true,
                      })
                      .then((newSession) => {
                        setActiveSessionId(newSession.id);
                        setView({ kind: "session", sessionId: newSession.id });
                        if (envId) select(envId);
                        // Insert a PR reference card
                        setTimeout(() => {
                          void transcriptService.appendMessage({
                            id: `pr-ref-${Date.now()}`,
                            sessionId: newSession.id,
                            role: "user",
                            content: JSON.stringify({
                              kind: "pr-reference-card",
                              prNumber: item.number,
                              prTitle: item.title,
                              prRepo: item.repo,
                              prAuthor: item.author,
                              prUrl: item.url,
                              prVerdict: item.verdict,
                            }),
                            startedAt: Date.now(),
                            finishedAt: Date.now(),
                          });
                        }, 100);
                      });
                  }}
                />
              ) : null}
            </div>
          </>
        )}
      </div>

      {vmWizardOpen ? (
        <AddVmWizard
          onDone={handleVmWizardDone}
          onCancel={() => {
            setVmWizardOpen(false);
            setWizardSeed(null);
          }}
          initialSeed={wizardSeed}
        />
      ) : null}

      {pickMainVmOpen ? (
        <PickMainVmModal
          candidates={environments.filter((e) => e.role !== "main-vm")}
          onPick={(id) => {
            void handleStampCheckedSetMainVm(id);
            setPickMainVmOpen(false);
          }}
          onSkip={() => setPickMainVmOpen(false)}
        />
      ) : null}

      {restoreOfferOpen && restoreAvailability && restoreAvailability.available ? (
        <RestoreOffer
          availability={restoreAvailability}
          onRestore={handlePullRestore}
          onSkip={handleSkipRestore}
        />
      ) : null}

      {staleConfigResult ? (
        <StaleConfigWarning
          staleResult={staleConfigResult}
          onPullRemote={handleStalePullRemote}
          onOverwriteAnyway={handleStaleOverwriteAnyway}
          onCancel={handleStaleCancel}
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

      {confirmUnpersistId ? (() => {
        const session = sessions.find((s) => s.id === confirmUnpersistId);
        return (
          <div className="modal-backdrop" onClick={() => setConfirmUnpersistId(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 380 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
                {intl.formatMessage({ id: "session.unpersistTitle" })}
              </h2>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 20px", lineHeight: 1.5 }}>
                {intl.formatMessage({ id: "session.unpersistConfirm" }, { title: session?.title ?? "" })}
              </p>
              <div className="modal-actions">
                <button className="btn" onClick={() => setConfirmUnpersistId(null)}>
                  {intl.formatMessage({ id: "session.unpersistCancel" })}
                </button>
                <button
                  className="btn"
                  style={{ background: "color-mix(in srgb, var(--warning) 18%, transparent)", color: "var(--warning)", borderColor: "color-mix(in srgb, var(--warning) 30%, transparent)" }}
                  onClick={() => handleUnpersistSession(confirmUnpersistId)}
                >
                  {intl.formatMessage({ id: "session.unpersistConfirmBtn" })}
                </button>
              </div>
            </div>
          </div>
        );
      })() : null}

      {budgetPanelOpen ? (
        <BudgetWatchPanel
          watches={budgetWatch.watches}
          breaches={budgetWatch.breaches}
          environments={environments}
          perEnvLoops={perEnvLoops}
          onAddWatch={(watch) => void budgetWatch.addWatch(watch)}
          onRemoveWatch={(id) => void budgetWatch.removeWatch(id)}
          onToggleWatch={(id, enabled) => void budgetWatch.toggleWatch(id, enabled)}
          onDismissBreach={(id) => void budgetWatch.dismissBreach(id)}
          onResumeLoop={(envId, loopId) => void budgetWatch.resumeLoop(envId, loopId)}
          onClose={() => setBudgetPanelOpen(false)}
        />
      ) : null}

      <SettingsPanel
        open={settingsPanelOpen}
        onClose={() => setSettingsPanelOpen(false)}
        settings={globalSettings}
        onUpdateSettings={handleUpdateGlobalSettings}
        environments={environments}
        notificationMuted={globalMuted}
        onToggleNotificationMute={handleToggleGlobalMute}
        onSetMainVm={(envId) => {
          void handleStampCheckedSetMainVm(envId);
        }}
      />

      <InstanceSettingsPanel
        open={instanceSettingsEnvId !== null}
        onClose={() => setInstanceSettingsEnvId(null)}
        environment={environments.find((e) => e.id === instanceSettingsEnvId) ?? null}
        onUpdateEnvironment={(id, updates) => update(id, updates)}
        onAddEndpoint={(envId, url, kind) => addEndpoint(envId, url, kind)}
        onRemoveEndpoint={(envId, epId) => removeEndpoint(envId, epId)}
        onSetActiveEndpoint={(envId, epId) => {
          setActiveEndpoint(envId, epId);
          void connectionService.retry(envId);
        }}
        onRemoveEnvironment={(id) => remove(id)}
        onExchangePairingCode={async (baseUrl, code) => {
          const result = await configService.exchangePairingCode(baseUrl, code);
          return { ok: result.ok, error: result.ok ? undefined : result.error };
        }}
        onRemoveSessionToken={(envId) => {
          removeSessionToken(envId);
        }}
      />

      {/* Toast overlay for discard undo and other transient messages */}
      <Toast />
    </div>
  );
}
