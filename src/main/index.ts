import { app, BrowserWindow, ipcMain, shell, dialog, Menu } from "electron";
import path from "node:path";
import fs from "node:fs";
import { logger, createLogger } from "./logger.js";
import type { LogEntry, SerializableValue } from "../shared/log.js";
import type {
  ApiRequestArgs,
  ApiResponse,
  ConnectionStatus,
  EndpointHealth,
  StreamSubscribeArgs,
  OpenCodeConnectionStatus,
  OpenCodeEndpoint,
  InfraActionArgs,
  InfraActionResult,
  PlatformType,
  BudgetWatch,
  BudgetBreach,
  InboxItem,
  InboxQueryResult,
  OutageEscalation,
  ResolvedInboxItem,
  VmWizardStartOptions,
  ReachabilityStatus,
  TranscriptMessage,
  McpConnectionStatus,
  McpToolCallResult,
  LoopShape,
} from "../shared/ipc.js";
import type { AgentRuntime, Environment, SessionScope, NotificationSendArgs, ConfigStamp, StampCheckedWriteResult, GlobalSettings } from "../shared/ipc.js";
import { IPC_CHANNELS } from "../shared/ipc-channels.js";
import { trimTrailingSlash } from "../shared/utils.js";
import { fetchAndUnwrap } from "./http-utils.js";
import { parseSseStream } from "./sse-parser.js";
import { platformCache, platformCacheKey } from "./platform-classifier.js";
import {
  getEnvironments,
  addEnvironment,
  removeEnvironment,
  updateEnvironment,
  addEndpoint,
  removeEndpoint,
  setActiveEndpoint,
  getSelectedEnvironmentId,
  setSelectedEnvironmentId,
  migrateFromLocalStorage,
  findEnvironmentByFingerprint,
  setEnvironmentFingerprintId,
  getSessionToken,
  setEnvironmentAuthState,
  storeSessionToken,
  removeSessionToken,
  exchangePairingCode,
  setOpenCodeEndpoint,
  setInfraOpenCodeEndpoint,
  getEnvironmentsForRenderer,
  getMainVmId,
  getMainVm,
  setMainVm,
  autoPromoteFirstEnvIfNeeded,
  getBudgetWatches,
  addBudgetWatch,
  removeBudgetWatch,
  updateBudgetWatch,
  getBudgetBreaches,
  addBudgetBreach,
  dismissBudgetBreach,
  pruneOldBreaches,
  getInboxDismissedIds,
  dismissInboxItem,
  addResolvedItem,
  getResolvedItems,
  pruneResolvedItems,
  getProjectPickupLabels,
  setProjectPickupLabels,
  getProjectPipelineLabels,
  setProjectPipelineLabels,
  getChatSessions,
  addChatSession,
  removeChatSession,
  updateChatSession,
  pinChatSession,
  renameChatSession,
  reorderChatSessions,
  getExpandedProjects,
  setExpandedProjects,
  exportBootstrapSeed,
  importBootstrapSeed,
  checkRestoreAvailable,
  pullRestore,
  getConfigStamp,
  stampCheckedSetMainVm,
  forceSetMainVm,
  sweepEphemeralSessions,
  getGlobalSettings,
  updateGlobalSettings,
} from "./config-store.js";
import {
  getMessages as transcriptGetMessages,
  appendMessage as transcriptAppendMessage,
  appendMessages as transcriptAppendMessages,
  updateMessage as transcriptUpdateMessage,
  deleteSession as transcriptDeleteSession,
} from "./transcript-store.js";
import {
  ConnectionSupervisor,
  EndpointHealthTracker,
  makeProbe,
  resolveActiveUrl,
  fetchFingerprint,
} from "./connection-supervisor.js";
import { fetchPeers } from "./tailscale.js";
import { getOpenCodeStatus, refreshOpenCodeStatus, clearOpenCodeStatus, destroyAllOpenCodeStatus } from "./opencode-client.js";
import { listSshHosts as vmListSshHosts, runWizard, cancelWizard, respondConsent, respondServiceSelection, respondRuntimeConsent, respondHostKey } from "./vm-wizard.js";
import { msg } from "./i18n.js";
import { validateIpc, safeHandle, IpcValidationError, checkLogRateLimit } from "./ipc-validation.js";
import { isUrlAllowedForFetch } from "./ssrf-allowlist.js";
import { setMainWindow, getMainWindow } from "./main-window.js";
import { NotificationService } from "./notification-service.js";
import { OutageTracker } from "./outage-tracker.js";
import { ReachabilityTracker } from "./reachability-tracker.js";
import {
  openTunnelsForEnvironment,
  openTunnelForEndpoint,
  closeTunnelForEndpoint,
  closeTunnelsForEnvironment,
  resolveEffectiveUrl,
  closeAllRegistryTunnels,
  forceKillAllRegistryTunnels,
  onTunnelReconnect,
  isTunnelLocalPort,
} from "./tunnel-registry.js";
import {
  getMcpStatus,
  connectMcp,
  disconnectMcp,
  callMcpTool,
  removeMcpSession,
} from "./mcp-client.js";
import { sendPromptToAgent, interruptAgent } from "./agent-client.js";
import { listModelsForEnvironment } from "./agent-models.js";
import type { AgentSendPromptArgs } from "../shared/ipc.js";
import {
  initLoopShapeCache,
  getCached as getLoopShapeCached,
  getAllCached as getAllLoopShapeCached,
  refreshForEnvironment as refreshLoopShapesForEnvironment,
  removeEnvironmentShapes,
  onCacheUpdate as onLoopShapeCacheUpdate,
} from "./loop-shape-cache.js";
import { isDeclined as isSiblingDeclined, recordDecline as recordSiblingDecline } from "./sibling-decline-store.js";
import { handleInfraExecuteAction } from "./infra-handlers.js";
import { validateBounds } from "./window-bounds.js";
import type { WindowBounds } from "./window-bounds.js";

interface StreamEntry {
  controller: AbortController;
  sender: Electron.WebContents;
}

const streams = new Map<string, StreamEntry>();
const streamEnvironments = new Map<string, string>();

const notificationService = new NotificationService();

const outageTracker = new OutageTracker(
  (event: OutageEscalation) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.OUTAGE_ESCALATION, event);
    }

    // Send OS notification for prolonged outage
    const envs = getEnvironments();
    const env = envs.find((e: Environment) => e.id === event.environmentId);
    const envName = env?.name ?? event.environmentId;
    const durationMin = Math.round(event.durationMs / 60_000);

    notificationService.send({
      title: `${envName} has been unreachable for ${durationMin}m`,
      body: `The instance went offline at ${new Date(event.since).toLocaleTimeString()}. It will self-resolve when reconnected.`,
      tag: `outage:${event.environmentId}`,
      deepLink: { kind: "instance", environmentId: event.environmentId },
      suppressIfFocused: false,
    });
  },
  (environmentId: string) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.OUTAGE_RESOLVE, environmentId);
    }
  },
);

const reachabilityTracker = new ReachabilityTracker();

// Forward loop-shape cache updates to the renderer
onLoopShapeCacheUpdate((shapes: LoopShape[]) => {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.LOOP_SHAPE_CACHE_UPDATE, shapes);
  }
});

// Wire tunnel auto-reconnect into the connection supervisor.
// When a tunnel drops, the supervisor will see probe failures and enter backoff.
// When the tunnel reconnects, wake up the supervisor immediately so it probes
// and transitions to "connected" without waiting for its own backoff timer.
onTunnelReconnect((environmentId: string, _endpointId: string, reconnecting: boolean) => {
  if (!reconnecting) {
    // Tunnel is back — wake up the supervisor and endpoint tracker
    const supervisor = supervisors.get(environmentId);
    if (supervisor) supervisor.wakeup();

    const tracker = endpointTrackers.get(environmentId);
    if (tracker) tracker.wakeup();
  }
});

/** Get the connection supervisor status phase for an environment, or null. */
function getSupervisorPhase(environmentId: string): string | null {
  const supervisor = supervisors.get(environmentId);
  return supervisor ? supervisor.getStatus().phase : null;
}

const supervisors = new Map<string, ConnectionSupervisor>();
const endpointTrackers = new Map<string, EndpointHealthTracker>();

function getOrCreateSupervisor(environmentId: string, baseUrl: string): ConnectionSupervisor {
  let existing = supervisors.get(environmentId);
  if (existing) return existing;

    const supervisor = new ConnectionSupervisor(
     makeProbe(baseUrl, environmentId),
     (status: ConnectionStatus) => {
       const win = getMainWindow();
       if (win) {
          win.webContents.send(IPC_CHANNELS.CONNECTION_STATUS, environmentId, status);
       }
       // Feed status changes to the outage tracker
       outageTracker.handleStatusChange(environmentId, status);
       // Feed status changes to the reachability tracker (its own health layer)
       reachabilityTracker.handleConnectionPhaseChange(environmentId, status.phase);
       // Forward reachability changes to the renderer
       const reachabilityStatus = reachabilityTracker.getStatus(environmentId);
       if (reachabilityStatus && win && !win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.REACHABILITY_STATUS, reachabilityStatus);
       }
     },
   );
  supervisors.set(environmentId, supervisor);
  supervisor.start();
  return supervisor;
}

function syncEndpointTracker(environmentId: string): void {
  const envs = getEnvironments();
  const env = envs.find((e: Environment) => e.id === environmentId);
  if (!env) return;

  let tracker = endpointTrackers.get(environmentId);
  if (!tracker) {
    tracker = new EndpointHealthTracker(
      environmentId,
      (health) => {
        const win = getMainWindow();
        if (win) {
          win.webContents.send(IPC_CHANNELS.CONNECTION_ENDPOINT_HEALTH, environmentId, health);
        }
      },
      // Resolve effective URLs through the tunnel registry for SSH endpoints
      (endpointId: string, rawUrl: string): string => {
        const ep = env.endpoints.find((e) => e.id === endpointId);
        if (ep) return resolveEffectiveUrl(environmentId, ep);
        return rawUrl;
      },
    );
    endpointTrackers.set(environmentId, tracker);
  }
  tracker.syncEndpoints(env.endpoints);
}

function removeSupervisor(environmentId: string): void {
  const supervisor = supervisors.get(environmentId);
  if (supervisor) {
    supervisor.destroy();
    supervisors.delete(environmentId);
  }
  const tracker = endpointTrackers.get(environmentId);
  if (tracker) {
    tracker.destroy();
    endpointTrackers.delete(environmentId);
  }
  outageTracker.removeEnvironment(environmentId);
  reachabilityTracker.removeEnvironment(environmentId);
  closeTunnelsForEnvironment(environmentId);
}

function abortStreamsForEnvironment(environmentId: string): void {
  for (const [subId, envId] of streamEnvironments) {
    if (envId === environmentId) {
      streams.get(subId)?.controller.abort();
      streams.delete(subId);
      streamEnvironments.delete(subId);
    }
  }
}

function wakeupAll(): void {
  for (const supervisor of supervisors.values()) {
    supervisor.wakeup();
  }
}

let osOffline = false;

function setOsOffline(value: boolean): void {
  if (osOffline === value) return;
  osOffline = value;
  for (const supervisor of supervisors.values()) {
    supervisor.setOsOffline(value);
  }
  for (const tracker of endpointTrackers.values()) {
    tracker.setOsOffline(value);
  }
  if (!osOffline) {
    wakeupAll();
  }
}

/** Shared warning dialog for when password encryption is unavailable. */
function showEncryptionWarning(): void {
  void dialog.showMessageBox({
    type: "warning",
    title: "Password Not Saved",
    message: "Password storage requires a keychain.",
    detail: "Install libsecret on Linux or ensure a keychain is available on your system. Your password was not saved.",
  });
}

function isAllowedBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return isUrlAllowedForFetch(url, { allowLoopback: true });
  } catch {
    return false;
  }
}

function isEffectiveUrlAllowed(effectiveUrl: string): { allowed: boolean; host: string } {
  try {
    const url = new URL(effectiveUrl);
    const host = url.hostname.toLowerCase();
    if (!isUrlAllowedForFetch(url, { allowLoopback: false })) {
      if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
        const port = parseInt(url.port, 10);
        if (port && isTunnelLocalPort(port)) {
          return { allowed: true, host };
        }
      }
      return { allowed: false, host };
    }
    return { allowed: true, host };
  } catch {
    return { allowed: false, host: effectiveUrl };
  }
}

function joinUrl(baseUrl: string, apiPath: string): string {
  return `${trimTrailingSlash(baseUrl)}${apiPath.startsWith("/") ? "" : "/"}${apiPath}`;
}

function findEnvironmentIdByUrl(baseUrl: string): string | null {
  const normalized = trimTrailingSlash(baseUrl.trim());
  const envs = getEnvironments();
  for (const env of envs) {
    for (const ep of env.endpoints) {
      if (trimTrailingSlash(ep.url.trim()) === normalized) return env.id;
    }
  }
  return null;
}

/**
 * For a raw baseUrl from the renderer, find the corresponding endpoint
 * and return the effective URL (tunneled for SSH, original for others).
 */
function resolveEffectiveUrlForBaseUrl(environmentId: string, baseUrl: string): string {
  const normalized = trimTrailingSlash(baseUrl.trim());
  const envs = getEnvironments();
  const env = envs.find((e: Environment) => e.id === environmentId);
  if (env) {
    for (const ep of env.endpoints) {
      if (trimTrailingSlash(ep.url.trim()) === normalized) {
        return resolveEffectiveUrl(environmentId, ep);
      }
    }
  }
  // Fallback: return the original URL (non-SSH or not found in registry)
  return baseUrl;
}

async function handleApiRequest(args: ApiRequestArgs): Promise<ApiResponse> {
  if (!isAllowedBaseUrl(args.baseUrl)) {
    return { ok: false, status: 0, error: msg("vmWizard.mainInvalidEnvUrl", { url: args.baseUrl }) };
  }

  const envId = findEnvironmentIdByUrl(args.baseUrl);
  if (!envId) {
    return { ok: false, status: 0, error: msg("vmWizard.mainBaseUrlNotRegistered", { url: args.baseUrl }) };
  }

  const token = getSessionToken(envId);

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token.accessToken}`;

  // For SSH endpoints, resolve the effective (tunneled) URL so the request
  // goes through the local forwarded port instead of the unreachable remote host.
  const effectiveBaseUrl = resolveEffectiveUrlForBaseUrl(envId, args.baseUrl);

  const effectiveUrlCheck = isEffectiveUrlAllowed(effectiveBaseUrl);
  if (!effectiveUrlCheck.allowed) {
    return { ok: false, status: 0, error: msg("vmWizard.mainHostBlocked", { host: effectiveUrlCheck.host }) };
  }

  return fetchAndUnwrap(joinUrl(effectiveBaseUrl, args.path), {
    method: args.method,
    headers,
    body: args.body,
    timeoutMs: args.timeoutMs,
    onUnauthorized: async () => {
      await removeSessionToken(envId);
      await setEnvironmentAuthState(envId, "blocked");
    },
  });
}

async function handleStreamSubscribe(
  sender: Electron.WebContents,
  args: StreamSubscribeArgs,
): Promise<void> {
  if (!isAllowedBaseUrl(args.baseUrl)) return;
  if (streams.has(args.subId)) return;

  const envId = findEnvironmentIdByUrl(args.baseUrl);
  if (!envId) {
    const send = (kind: "data" | "event" | "end" | "error", text: string): void => {
      if (!sender.isDestroyed()) {
        sender.send(IPC_CHANNELS.STREAM_EVENT, { subId: args.subId, kind, text });
      }
    };
    send("error", "Base URL not registered as an environment");
    return;
  }

  const controller = new AbortController();
  streams.set(args.subId, { controller, sender });
  streamEnvironments.set(args.subId, envId);

  sender.once("destroyed", () => {
    controller.abort();
    streams.delete(args.subId);
    streamEnvironments.delete(args.subId);
  });

  const send = (kind: "data" | "event" | "end" | "error", text: string): void => {
    if (!sender.isDestroyed()) {
      sender.send(IPC_CHANNELS.STREAM_EVENT, { subId: args.subId, kind, text });
    }
  };

  const token = getSessionToken(envId);

  const streamHeaders: Record<string, string> = { Accept: "text/event-stream" };
  if (token) streamHeaders["Authorization"] = `Bearer ${token.accessToken}`;

  // For SSH endpoints, resolve the effective (tunneled) URL.
  const effectiveBaseUrl = resolveEffectiveUrlForBaseUrl(envId, args.baseUrl);

  const effectiveUrlCheck = isEffectiveUrlAllowed(effectiveBaseUrl);
  if (!effectiveUrlCheck.allowed) {
    send("error", `Host blocked: ${effectiveUrlCheck.host}`);
    streams.delete(args.subId);
    streamEnvironments.delete(args.subId);
    return;
  }

  try {
    const res = await fetch(joinUrl(effectiveBaseUrl, args.path), {
      signal: controller.signal,
      headers: streamHeaders,
    });
    if (!res.ok || !res.body) {
      send("error", `HTTP ${res.status}`);
      return;
    }

    await parseSseStream(res.body, (event) => {
      send(event.kind, event.text);
    });
    send("end", "");
  } catch (err) {
    if (!(err instanceof Error && err.name === "AbortError")) {
      send("error", err instanceof Error ? err.message : String(err));
    }
  } finally {
    streams.delete(args.subId);
    streamEnvironments.delete(args.subId);
  }
}

function boundsFile(): string {
  return path.join(app.getPath("userData"), "window-bounds.json");
}

function loadBounds(): WindowBounds {
  try {
    const raw = fs.readFileSync(boundsFile(), "utf8");
    const validated = validateBounds(JSON.parse(raw));
    if (validated) return validated;
    logger.warn("[bounds] Invalid bounds file content, using defaults");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.warn("[bounds] Failed to load bounds file, using defaults:", err);
    }
  }
  return { width: 1440, height: 900 };
}

function saveBounds(win: BrowserWindow): void {
  try {
    const bounds: WindowBounds = { ...win.getNormalBounds(), maximized: win.isMaximized() };
    fs.writeFileSync(boundsFile(), JSON.stringify(bounds));
  } catch (err) {
    logger.warn("[bounds] Failed to save window bounds:", err);
  }
}

async function seedEnvironmentInfrastructure(environmentId: string, options?: { replaceSupervisor?: boolean }): Promise<void> {
  const envs = getEnvironments();
  const env = envs.find((e) => e.id === environmentId);
  if (!env) return;

  if (options?.replaceSupervisor) {
    removeSupervisor(environmentId);
  }

  await openTunnelsForEnvironment(env.id, env.endpoints, env.activeEndpointId);
  const activeEp = env.activeEndpointId
    ? env.endpoints.find((e) => e.id === env.activeEndpointId)
    : env.endpoints[0];
  const url = activeEp ? resolveEffectiveUrl(env.id, activeEp) : resolveActiveUrl(env.endpoints, env.activeEndpointId);
  if (url) getOrCreateSupervisor(env.id, url);
  syncEndpointTracker(env.id);
  void connectMcp(env.id);
  void refreshLoopShapesForEnvironment(env.id);
}

async function seedSupervisors(): Promise<void> {
  for (const env of getEnvironments()) {
    await seedEnvironmentInfrastructure(env.id);
    if (env.opencode) {
      void refreshOpenCodeStatus(env.id, env.opencode);
    }
  }
}

function createWindow(): void {
  const saved = loadBounds();
  const win = new BrowserWindow({
    x: saved.x,
    y: saved.y,
    width: saved.width,
    height: saved.height,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: "Orbion",
    icon: path.join(import.meta.dirname, "../../resources/icon.png"),
    backgroundColor: "#0d141f",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0d141f",
      symbolColor: "#a4b1cd",
      height: 40,
    },
    webPreferences: {
      preload: path.join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => {
    if (saved.maximized) win.maximize();
    win.show();
    void seedSupervisors();
  });

  let saveTimer: NodeJS.Timeout | null = null;
  const scheduleSave = (): void => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveBounds(win), 500);
  };
  win.on("resize", scheduleSave);
  win.on("move", scheduleSave);
  win.on("close", () => saveBounds(win));

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(path.join(import.meta.dirname, "../renderer/index.html"));
  }

  win.on("focus", () => {
    wakeupAll();
  });

  setMainWindow(win);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on("second-instance", () => {
  const win = getMainWindow();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.setName("Orbion");

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "Help",
      submenu: [
        {
          label: "Show Logs",
          click: () => {
            void shell.openPath(path.join(app.getPath("userData"), "logs")).then((error) => {
              if (error) logger.warn(`Failed to open logs directory: ${error}`);
            });
          },
        },
      ],
    },
  ]));

  safeHandle(IPC_CHANNELS.LOG_WRITE, (_event, ...rawArgs) => {
    checkLogRateLimit(_event.sender.id);
    const [entry] = validateIpc<[LogEntry]>(IPC_CHANNELS.LOG_WRITE, rawArgs);
    const scopedLogger = entry.module ? createLogger(entry.module.slice(0, 100)) : logger;
    scopedLogger[entry.level](`${entry.message.slice(0, 10_000)}${formatLogContext(entry.context)}`);
  });

  safeHandle(IPC_CHANNELS.API_REQUEST, (_event, ...rawArgs) => {
    const [args] = validateIpc<[ApiRequestArgs]>(IPC_CHANNELS.API_REQUEST, rawArgs);
    return handleApiRequest(args);
  });

  safeHandle(IPC_CHANNELS.STREAM_SUBSCRIBE, (event, ...rawArgs) => {
    const [args] = validateIpc<[StreamSubscribeArgs]>(IPC_CHANNELS.STREAM_SUBSCRIBE, rawArgs);
    void handleStreamSubscribe(event.sender, args);
  });

  safeHandle(IPC_CHANNELS.STREAM_UNSUBSCRIBE, (_event, ...rawArgs) => {
    const [subId] = validateIpc<[string]>(IPC_CHANNELS.STREAM_UNSUBSCRIBE, rawArgs);
    streams.get(subId)?.controller.abort();
    streams.delete(subId);
    streamEnvironments.delete(subId);
  });

  safeHandle(IPC_CHANNELS.CONFIG_GET_ENVIRONMENTS, () => {
    validateIpc(IPC_CHANNELS.CONFIG_GET_ENVIRONMENTS, []);
    return getEnvironmentsForRenderer();
  });
  safeHandle(IPC_CHANNELS.CONFIG_ADD_ENVIRONMENT, async (_event, ...rawArgs) => {
    const [name, url, kind] = validateIpc<[string, string, string | undefined]>(IPC_CHANNELS.CONFIG_ADD_ENVIRONMENT, rawArgs);
    const endpointKind = (kind as "direct" | "ssh" | "tailscale") ?? "direct";
    const fingerprint = await fetchFingerprint(url);
    if (fingerprint) {
      const existing = findEnvironmentByFingerprint(fingerprint.id);
      if (existing) {
        await addEndpoint(existing.id, url, endpointKind);
        await seedEnvironmentInfrastructure(existing.id);
        return existing;
      }
    }
    const env = await addEnvironment(name, url, endpointKind);
    if (fingerprint) {
      await setEnvironmentFingerprintId(env.id, fingerprint.id);
    }
    await autoPromoteFirstEnvIfNeeded();
    await seedEnvironmentInfrastructure(env.id);
    return env;
  });
  safeHandle(IPC_CHANNELS.CONFIG_EXCHANGE_PAIRING_CODE, async (_event, ...rawArgs) => {
    const [baseUrl, code, scope] = validateIpc<[string, string, string | undefined]>(IPC_CHANNELS.CONFIG_EXCHANGE_PAIRING_CODE, rawArgs);
    const sessionScope = (scope as SessionScope) ?? "read-only";
    const result = await exchangePairingCode(baseUrl, code, sessionScope);
    if (result.ok && result.token) {
      const envId = findEnvironmentIdByUrl(baseUrl);
      if (envId) {
        await storeSessionToken(envId, result.token);
      }
    }
    return result;
  });
  safeHandle(IPC_CHANNELS.CONFIG_REMOVE_SESSION_TOKEN, async (_event, ...rawArgs) => {
    const [environmentId] = validateIpc<[string]>(IPC_CHANNELS.CONFIG_REMOVE_SESSION_TOKEN, rawArgs);
    await removeSessionToken(environmentId);
  });
  safeHandle(IPC_CHANNELS.CONFIG_REMOVE_ENVIRONMENT, async (_event, ...rawArgs) => {
    const [id] = validateIpc<[string]>(IPC_CHANNELS.CONFIG_REMOVE_ENVIRONMENT, rawArgs);
    removeSupervisor(id);
    clearOpenCodeStatus(id);
    removeMcpSession(id);
    removeEnvironmentShapes(id);
    abortStreamsForEnvironment(id);
    await removeEnvironment(id);
  });
  safeHandle(IPC_CHANNELS.CONFIG_UPDATE_ENVIRONMENT, async (_event, ...rawArgs) => {
    const [id, updates] = validateIpc<[string, { name?: string; agentRuntime?: AgentRuntime; sshControlTarget?: string | null }]>(IPC_CHANNELS.CONFIG_UPDATE_ENVIRONMENT, rawArgs);
    await updateEnvironment(id, updates);
  });
  safeHandle(IPC_CHANNELS.CONFIG_ADD_ENDPOINT, async (_event, ...rawArgs) => {
    const [environmentId, url, kind] = validateIpc<[string, string, string]>(IPC_CHANNELS.CONFIG_ADD_ENDPOINT, rawArgs);
    const ep = await addEndpoint(environmentId, url, kind as "direct" | "ssh" | "tailscale");
    if (ep && ep.kind === "ssh") {
      await openTunnelForEndpoint(environmentId, ep);
    }
    syncEndpointTracker(environmentId);
    return ep;
  });
  safeHandle(IPC_CHANNELS.CONFIG_REMOVE_ENDPOINT, async (_event, ...rawArgs) => {
    const [environmentId, endpointId] = validateIpc<[string, string]>(IPC_CHANNELS.CONFIG_REMOVE_ENDPOINT, rawArgs);
    // Close tunnel before removing endpoint (need the endpoint data still present)
    const envsBefore = getEnvironments();
    const envBefore = envsBefore.find((e: Environment) => e.id === environmentId);
    const epBefore = envBefore?.endpoints.find((e) => e.id === endpointId);
    if (epBefore?.kind === "ssh") {
      closeTunnelForEndpoint(environmentId, endpointId);
    }
    await removeEndpoint(environmentId, endpointId);
    syncEndpointTracker(environmentId);
  });
  safeHandle(IPC_CHANNELS.CONFIG_SET_ACTIVE_ENDPOINT, async (_event, ...rawArgs) => {
    const [environmentId, endpointId] = validateIpc<[string, string]>(IPC_CHANNELS.CONFIG_SET_ACTIVE_ENDPOINT, rawArgs);
    await setActiveEndpoint(environmentId, endpointId);
    await seedEnvironmentInfrastructure(environmentId, { replaceSupervisor: true });
  });
  safeHandle(IPC_CHANNELS.CONFIG_GET_SELECTED_ENVIRONMENT_ID, () => {
    validateIpc(IPC_CHANNELS.CONFIG_GET_SELECTED_ENVIRONMENT_ID, []);
    return getSelectedEnvironmentId();
  });
  safeHandle(IPC_CHANNELS.CONFIG_SET_SELECTED_ENVIRONMENT_ID, async (_event, ...rawArgs) => {
    const [id] = validateIpc<[string | null]>(IPC_CHANNELS.CONFIG_SET_SELECTED_ENVIRONMENT_ID, rawArgs);
    return setSelectedEnvironmentId(id);
  });
  safeHandle(
    IPC_CHANNELS.CONFIG_MIGRATE_FROM_LOCAL_STORAGE,
    async (_event, ...rawArgs) => {
      const [rawInstances, rawSelectedId] = validateIpc<[string, string | null]>(IPC_CHANNELS.CONFIG_MIGRATE_FROM_LOCAL_STORAGE, rawArgs);
      return migrateFromLocalStorage(rawInstances, rawSelectedId);
    },
  );

  safeHandle(IPC_CHANNELS.CONNECTION_GET_STATUS, (_event, ...rawArgs) => {
    const [environmentId] = validateIpc<[string]>(IPC_CHANNELS.CONNECTION_GET_STATUS, rawArgs);
    const supervisor = supervisors.get(environmentId);
    return supervisor ? supervisor.getStatus() : null;
  });

  safeHandle(IPC_CHANNELS.CONNECTION_GET_ENDPOINT_HEALTH, (_event, ...rawArgs): EndpointHealth[] => {
    const [environmentId] = validateIpc<[string]>(IPC_CHANNELS.CONNECTION_GET_ENDPOINT_HEALTH, rawArgs);
    const tracker = endpointTrackers.get(environmentId);
    if (tracker) return tracker.getHealth();
    const envs = getEnvironments();
    const env = envs.find((e: Environment) => e.id === environmentId);
    if (!env) return [];
    return env.endpoints.map((ep) => ({
      endpointId: ep.id,
      phase: ep.failureCount > 0 && ep.lastError ? "backoff" as const : "connected" as const,
      lastError: ep.lastError,
      failureCount: ep.failureCount,
    }));
  });

  safeHandle(IPC_CHANNELS.CONNECTION_RETRY, (_event, ...rawArgs) => {
    const [environmentId] = validateIpc<[string]>(IPC_CHANNELS.CONNECTION_RETRY, rawArgs);
    const supervisor = supervisors.get(environmentId);
    if (supervisor) supervisor.wakeup();
  });

  ipcMain.on(IPC_CHANNELS.CONNECTION_NETWORK_CHANGED, (_event, ...rawArgs) => {
    try {
      const [online] = validateIpc<[boolean]>(IPC_CHANNELS.CONNECTION_NETWORK_CHANGED, rawArgs);
      setOsOffline(!online);
    } catch (err) {
      if (err instanceof IpcValidationError) {
        logger.error(`[IPC] ${err.message}`);
        return;
      }
      throw err;
    }
  });

  safeHandle(IPC_CHANNELS.TAILSCALE_PEERS, () => {
    validateIpc(IPC_CHANNELS.TAILSCALE_PEERS, []);
    return fetchPeers();
  });

  safeHandle(IPC_CHANNELS.VM_WIZARD_LIST_SSH_HOSTS, () => {
    validateIpc(IPC_CHANNELS.VM_WIZARD_LIST_SSH_HOSTS, []);
    return vmListSshHosts();
  });

  safeHandle(IPC_CHANNELS.VM_WIZARD_START, async (_event, ...rawArgs) => {
    const [options] = validateIpc<[VmWizardStartOptions]>(IPC_CHANNELS.VM_WIZARD_START, rawArgs);
    const result = await runWizard(options);
    await seedEnvironmentInfrastructure(result.environmentId);
    return result;
  });

  safeHandle(IPC_CHANNELS.VM_WIZARD_CANCEL, () => {
    validateIpc(IPC_CHANNELS.VM_WIZARD_CANCEL, []);
    cancelWizard();
  });

  safeHandle(IPC_CHANNELS.VM_WIZARD_RESPOND_CONSENT, (_event, ...rawArgs) => {
    const [decision] = validateIpc<["install" | "skip"]>(IPC_CHANNELS.VM_WIZARD_RESPOND_CONSENT, rawArgs);
    respondConsent(decision);
  });

  safeHandle(IPC_CHANNELS.VM_WIZARD_RESPOND_SERVICE_SELECTION, (_event, ...rawArgs) => {
    const [selection] = validateIpc<[import("../shared/ipc.js").VmWizardServiceSelection]>(IPC_CHANNELS.VM_WIZARD_RESPOND_SERVICE_SELECTION, rawArgs);
    respondServiceSelection(selection);
  });

  safeHandle(IPC_CHANNELS.VM_WIZARD_RESPOND_RUNTIME_CONSENT, (_event, ...rawArgs) => {
    const [decision] = validateIpc<["install" | "skip"]>(IPC_CHANNELS.VM_WIZARD_RESPOND_RUNTIME_CONSENT, rawArgs);
    respondRuntimeConsent(decision);
  });

  safeHandle(IPC_CHANNELS.VM_WIZARD_RESPOND_HOST_KEY, (_event, ...rawArgs) => {
    const [accepted] = validateIpc<[boolean]>(IPC_CHANNELS.VM_WIZARD_RESPOND_HOST_KEY, rawArgs);
    respondHostKey(accepted);
  });

  safeHandle(IPC_CHANNELS.OPENCODE_GET_STATUS, (_event, ...rawArgs): OpenCodeConnectionStatus => {
    const [environmentId] = validateIpc<[string]>(IPC_CHANNELS.OPENCODE_GET_STATUS, rawArgs);
    return getOpenCodeStatus(environmentId);
  });

  safeHandle(IPC_CHANNELS.OPENCODE_REFRESH_STATUS, async (_event, ...rawArgs): Promise<OpenCodeConnectionStatus> => {
    const [environmentId] = validateIpc<[string]>(IPC_CHANNELS.OPENCODE_REFRESH_STATUS, rawArgs);
    const envs = getEnvironments();
    const env = envs.find((e: Environment) => e.id === environmentId);
    if (!env?.opencode) {
      return getOpenCodeStatus(environmentId);
    }
    return refreshOpenCodeStatus(environmentId, env.opencode);
  });

  safeHandle(IPC_CHANNELS.CONFIG_SET_OPENCODE_ENDPOINT, async (_event, ...rawArgs) => {
    const [environmentId, endpoint] = validateIpc<[string, OpenCodeEndpoint | null]>(IPC_CHANNELS.CONFIG_SET_OPENCODE_ENDPOINT, rawArgs);
    const result = await setOpenCodeEndpoint(environmentId, endpoint);
    if (!result.ok && result.reason === "encryption-unavailable") {
      showEncryptionWarning();
      return result;
    }
    if (endpoint) {
      await refreshOpenCodeStatus(environmentId, endpoint);
    } else {
      clearOpenCodeStatus(environmentId);
    }
    return result;
  });

  safeHandle(IPC_CHANNELS.CONFIG_SET_INFRA_OPENCODE_ENDPOINT, async (_event, ...rawArgs) => {
    const [environmentId, endpoint] = validateIpc<[string, OpenCodeEndpoint | null]>(IPC_CHANNELS.CONFIG_SET_INFRA_OPENCODE_ENDPOINT, rawArgs);
    const result = await setInfraOpenCodeEndpoint(environmentId, endpoint);
    if (!result.ok && result.reason === "encryption-unavailable") {
      showEncryptionWarning();
    }
    return result;
  });

  safeHandle(IPC_CHANNELS.CONFIG_SET_MAIN_VM, async (_event, ...rawArgs) => {
    const [environmentId] = validateIpc<[string]>(IPC_CHANNELS.CONFIG_SET_MAIN_VM, rawArgs);
    await setMainVm(environmentId);
  });

  safeHandle(IPC_CHANNELS.CONFIG_GET_MAIN_VM_ID, () => {
    validateIpc(IPC_CHANNELS.CONFIG_GET_MAIN_VM_ID, []);
    return getMainVmId();
  });

  safeHandle(IPC_CHANNELS.CONFIG_GET_PROJECT_PICKUP_LABELS, (_event, ...rawArgs) => {
    const [projectId] = validateIpc<[string]>(IPC_CHANNELS.CONFIG_GET_PROJECT_PICKUP_LABELS, rawArgs);
    return getProjectPickupLabels(projectId);
  });

  safeHandle(IPC_CHANNELS.CONFIG_SET_PROJECT_PICKUP_LABELS, async (_event, ...rawArgs) => {
    const [projectId, labels] = validateIpc<[string, string[]]>(IPC_CHANNELS.CONFIG_SET_PROJECT_PICKUP_LABELS, rawArgs);
    await setProjectPickupLabels(projectId, labels);
  });

  safeHandle(IPC_CHANNELS.CONFIG_GET_PROJECT_PIPELINE_LABELS, (_event, ...rawArgs) => {
    const [projectId] = validateIpc<[string]>(IPC_CHANNELS.CONFIG_GET_PROJECT_PIPELINE_LABELS, rawArgs);
    return getProjectPipelineLabels(projectId);
  });

  safeHandle(IPC_CHANNELS.CONFIG_SET_PROJECT_PIPELINE_LABELS, async (_event, ...rawArgs) => {
    const [projectId, labels] = validateIpc<[string, string[]]>(IPC_CHANNELS.CONFIG_SET_PROJECT_PIPELINE_LABELS, rawArgs);
    await setProjectPipelineLabels(projectId, labels);
  });

  safeHandle(IPC_CHANNELS.CONFIG_GET_CHAT_SESSIONS, () => {
    return getChatSessions();
  });

  safeHandle(IPC_CHANNELS.CONFIG_ADD_CHAT_SESSION, async (_event, ...rawArgs) => {
    const [session] = validateIpc<[Omit<import("../shared/ipc").ChatSession, "id" | "createdAt">]>(IPC_CHANNELS.CONFIG_ADD_CHAT_SESSION, rawArgs);
    return addChatSession(session);
  });

  safeHandle(IPC_CHANNELS.CONFIG_REMOVE_CHAT_SESSION, async (_event, ...rawArgs) => {
    const [sessionId] = validateIpc<[string]>(IPC_CHANNELS.CONFIG_REMOVE_CHAT_SESSION, rawArgs);
    await removeChatSession(sessionId);
    await transcriptDeleteSession(sessionId);
  });

  safeHandle(IPC_CHANNELS.CONFIG_UPDATE_CHAT_SESSION, async (_event, ...rawArgs) => {
    const [sessionId, updates] = validateIpc<[string, Partial<Pick<import("../shared/ipc").ChatSession, "title" | "lastActiveAt" | "projectName" | "environmentId" | "workingDirectory" | "activeRuntime" | "activeModel" | "reasoningEffort" | "persisted" | "turnCount" | "declineAutoPersistUntil" | "pinned">>]>(IPC_CHANNELS.CONFIG_UPDATE_CHAT_SESSION, rawArgs);
    await updateChatSession(sessionId, updates);
  });

  safeHandle(IPC_CHANNELS.CONFIG_PIN_CHAT_SESSION, async (_event, ...rawArgs) => {
    const [sessionId, pinned] = validateIpc<[string, boolean]>(IPC_CHANNELS.CONFIG_PIN_CHAT_SESSION, rawArgs);
    await pinChatSession(sessionId, pinned);
  });

  safeHandle(IPC_CHANNELS.CONFIG_RENAME_CHAT_SESSION, async (_event, ...rawArgs) => {
    const [sessionId, title] = validateIpc<[string, string]>(IPC_CHANNELS.CONFIG_RENAME_CHAT_SESSION, rawArgs);
    await renameChatSession(sessionId, title);
  });

  safeHandle(IPC_CHANNELS.CONFIG_REORDER_CHAT_SESSIONS, async (_event, ...rawArgs) => {
    const [orderedIds] = validateIpc<[string[]]>(IPC_CHANNELS.CONFIG_REORDER_CHAT_SESSIONS, rawArgs);
    await reorderChatSessions(orderedIds);
  });

  safeHandle(IPC_CHANNELS.CONFIG_GET_EXPANDED_PROJECTS, () => {
    return getExpandedProjects();
  });

  safeHandle(IPC_CHANNELS.CONFIG_SET_EXPANDED_PROJECTS, async (_event, ...rawArgs) => {
    const [expandedKeys] = validateIpc<[string[]]>(IPC_CHANNELS.CONFIG_SET_EXPANDED_PROJECTS, rawArgs);
    await setExpandedProjects(expandedKeys);
  });

  safeHandle(IPC_CHANNELS.CONFIG_EXPORT_BOOTSTRAP_SEED, () => {
    validateIpc(IPC_CHANNELS.CONFIG_EXPORT_BOOTSTRAP_SEED, []);
    return exportBootstrapSeed();
  });

  safeHandle(IPC_CHANNELS.CONFIG_IMPORT_BOOTSTRAP_SEED, (_event, ...rawArgs) => {
    const [seedString] = validateIpc<[string]>(IPC_CHANNELS.CONFIG_IMPORT_BOOTSTRAP_SEED, rawArgs);
    return importBootstrapSeed(seedString);
  });

  safeHandle(IPC_CHANNELS.CONFIG_CHECK_RESTORE_AVAILABLE, () => {
    validateIpc(IPC_CHANNELS.CONFIG_CHECK_RESTORE_AVAILABLE, []);
    return checkRestoreAvailable();
  });

  safeHandle(IPC_CHANNELS.CONFIG_PULL_RESTORE, async () => {
    validateIpc(IPC_CHANNELS.CONFIG_PULL_RESTORE, []);
    const result = await pullRestore();

    if (result.ok) {
      for (const env of result.restored) {
        await seedEnvironmentInfrastructure(env.id);
      }
    }

    return result;
  });

  safeHandle(IPC_CHANNELS.CONFIG_GET_STAMP, (): ConfigStamp => {
    validateIpc(IPC_CHANNELS.CONFIG_GET_STAMP, []);
    return getConfigStamp();
  });

  safeHandle(IPC_CHANNELS.CONFIG_STAMP_CHECKED_SET_MAIN_VM, async (_event, ...rawArgs): Promise<StampCheckedWriteResult> => {
    const [environmentId, knownStamp] = validateIpc<[string, ConfigStamp]>(IPC_CHANNELS.CONFIG_STAMP_CHECKED_SET_MAIN_VM, rawArgs);
    return stampCheckedSetMainVm(environmentId, knownStamp);
  });

  safeHandle(IPC_CHANNELS.CONFIG_FORCE_SET_MAIN_VM, async (_event, ...rawArgs): Promise<ConfigStamp> => {
    const [environmentId] = validateIpc<[string]>(IPC_CHANNELS.CONFIG_FORCE_SET_MAIN_VM, rawArgs);
    return forceSetMainVm(environmentId);
  });

  safeHandle(IPC_CHANNELS.CONFIG_SWEEP_EPHEMERAL_SESSIONS, async (_event, ...rawArgs): Promise<import("../shared/ipc").SweepEphemeralSessionsResult> => {
    const [args] = validateIpc<[import("../shared/ipc").SweepEphemeralSessionsArgs]>(IPC_CHANNELS.CONFIG_SWEEP_EPHEMERAL_SESSIONS, rawArgs);
    // Also delete transcripts for swept sessions
    const result = await sweepEphemeralSessions(args);
    for (const sessionId of result.removedSessionIds) {
      try { await transcriptDeleteSession(sessionId); } catch { /* best-effort */ }
    }
    return result;
  });


  // ── Infra action handlers (delegated to infra-handlers.ts) ──────────

  safeHandle(IPC_CHANNELS.INFRA_EXECUTE_ACTION, async (_event, ...rawArgs): Promise<InfraActionResult> => {
    const [args] = validateIpc<[InfraActionArgs]>(IPC_CHANNELS.INFRA_EXECUTE_ACTION, rawArgs);
    const result = await handleInfraExecuteAction(args, {
      getMainVm: () => getMainVm(),
      getEnvironments: () => getEnvironments(),
      resolveActiveUrl: (endpoints, activeEndpointId) => resolveActiveUrl(endpoints, activeEndpointId),
      handleApiRequest: (req) => handleApiRequest(req),
      getSupervisorPhase: (envId) => getSupervisorPhase(envId),
    });

    // Handle open-pr-in-browser side effect (requires shell from Electron)
    if (result.ok && args.action === "open-pr-in-browser") {
      const url = (result.data as { url?: string })?.url;
      if (url) {
        void shell.openExternal(url);
        return { ok: true, data: undefined };
      }
    }

    return result;
  });

  safeHandle(IPC_CHANNELS.INFRA_GET_STATUS, () => {
    validateIpc(IPC_CHANNELS.INFRA_GET_STATUS, []);
    const mainVmId = getMainVmId();
    const connected = mainVmId !== null && supervisors.has(mainVmId)
      && supervisors.get(mainVmId)!.getStatus().phase === "connected";
    return { mainVmId, connected };
  });

  safeHandle(IPC_CHANNELS.INFRA_GET_PLATFORM, (_event, ...rawArgs): PlatformType => {
    const [environmentId, projectId] = validateIpc<[string, string]>(IPC_CHANNELS.INFRA_GET_PLATFORM, rawArgs);
    const key = platformCacheKey(environmentId, projectId);
    return platformCache.get(key) ?? "unknown";
  });

  // ── Budget watch IPC handlers ───────────────────────────────────────

  safeHandle(IPC_CHANNELS.BUDGET_GET_WATCHES, (): BudgetWatch[] => {
    validateIpc(IPC_CHANNELS.BUDGET_GET_WATCHES, []);
    return getBudgetWatches();
  });

  safeHandle(IPC_CHANNELS.BUDGET_ADD_WATCH, async (_event, ...rawArgs): Promise<BudgetWatch> => {
    const [watch] = validateIpc<[Omit<BudgetWatch, "id" | "createdAt">]>(IPC_CHANNELS.BUDGET_ADD_WATCH, rawArgs);
    return addBudgetWatch(watch);
  });

  safeHandle(IPC_CHANNELS.BUDGET_REMOVE_WATCH, async (_event, ...rawArgs): Promise<void> => {
    const [watchId] = validateIpc<[string]>(IPC_CHANNELS.BUDGET_REMOVE_WATCH, rawArgs);
    await removeBudgetWatch(watchId);
  });

  safeHandle(IPC_CHANNELS.BUDGET_UPDATE_WATCH, async (_event, ...rawArgs): Promise<void> => {
    const [watchId, updates] = validateIpc<[string, Partial<Pick<BudgetWatch, "threshold" | "autoPause" | "enabled">>]>(IPC_CHANNELS.BUDGET_UPDATE_WATCH, rawArgs);
    await updateBudgetWatch(watchId, updates);
  });

  safeHandle(IPC_CHANNELS.BUDGET_GET_BREACHES, (): BudgetBreach[] => {
    validateIpc(IPC_CHANNELS.BUDGET_GET_BREACHES, []);
    return getBudgetBreaches();
  });

  safeHandle(IPC_CHANNELS.BUDGET_ADD_BREACH, async (_event, ...rawArgs): Promise<BudgetBreach> => {
    const [breach] = validateIpc<[Omit<BudgetBreach, "id">]>(IPC_CHANNELS.BUDGET_ADD_BREACH, rawArgs);
    return addBudgetBreach(breach);
  });

  safeHandle(IPC_CHANNELS.BUDGET_DISMISS_BREACH, async (_event, ...rawArgs): Promise<void> => {
    const [breachId] = validateIpc<[string]>(IPC_CHANNELS.BUDGET_DISMISS_BREACH, rawArgs);
    await dismissBudgetBreach(breachId);
  });

  // ── Inbox ──────────────────────────────────────────────────────────

  safeHandle(IPC_CHANNELS.INBOX_GET_ITEMS, (): InboxItem[] => {
    validateIpc(IPC_CHANNELS.INBOX_GET_ITEMS, []);
    // Inbox items are derived from existing data + dismissed state.
    // The renderer computes the actual item list from perEnvLoops/breaches;
    // the main process only tracks which items the user has dismissed.
    // We return an empty array here; the real assembly happens in the renderer.
    // This channel exists so the dismiss state is queryable via IPC.
    return [];
  });

  safeHandle(IPC_CHANNELS.INBOX_GET_DISMISSED_IDS, (): string[] => {
    validateIpc(IPC_CHANNELS.INBOX_GET_DISMISSED_IDS, []);
    return getInboxDismissedIds();
  });

  safeHandle(IPC_CHANNELS.INBOX_DISMISS_ITEM, async (_event, ...rawArgs): Promise<void> => {
    const [itemId] = validateIpc<[string]>(IPC_CHANNELS.INBOX_DISMISS_ITEM, rawArgs);
    await dismissInboxItem(itemId);
  });

  safeHandle(IPC_CHANNELS.INBOX_QUERY_FLEET, async (_event, ..._rawArgs): Promise<InboxQueryResult> => {
    // Fleet queries are computed entirely in the renderer from live data.
    // The main process provides the dismissed-IDs list so the renderer
    // can filter out acknowledged items.
    // Return minimal result; the renderer InboxService enriches it
    return { answer: "", references: [] };
  });

  safeHandle(IPC_CHANNELS.INBOX_RESOLVE_ITEM, async (_event, ...rawArgs): Promise<void> => {
    const [resolved] = validateIpc<[ResolvedInboxItem]>(IPC_CHANNELS.INBOX_RESOLVE_ITEM, rawArgs);
    await addResolvedItem(resolved);
  });

  safeHandle(IPC_CHANNELS.INBOX_GET_RESOLVED_ITEMS, (): ResolvedInboxItem[] => {
    validateIpc(IPC_CHANNELS.INBOX_GET_RESOLVED_ITEMS, []);
    return getResolvedItems();
  });

  safeHandle(IPC_CHANNELS.INBOX_PRUNE_RESOLVED_ITEMS, async (): Promise<void> => {
    await pruneResolvedItems();
  });

  // ── Native OS notifications ─────────────────────────────────────────

  safeHandle(IPC_CHANNELS.NOTIFICATION_SEND, (_event, ...rawArgs): void => {
    const [args] = validateIpc<[NotificationSendArgs]>(IPC_CHANNELS.NOTIFICATION_SEND, rawArgs);
    notificationService.send(args);
  });

  safeHandle(IPC_CHANNELS.NOTIFICATION_SET_MUTED, (_event, ...rawArgs): void => {
    const [muted] = validateIpc<[boolean]>(IPC_CHANNELS.NOTIFICATION_SET_MUTED, rawArgs);
    notificationService.setMuted(muted);
  });

  safeHandle(IPC_CHANNELS.NOTIFICATION_IS_MUTED, (): boolean => {
    validateIpc(IPC_CHANNELS.NOTIFICATION_IS_MUTED, []);
    return notificationService.isMuted();
  });

  // ── Outage escalation ────────────────────────────────────────────

  safeHandle(IPC_CHANNELS.OUTAGE_GET_ESCALATIONS, (): OutageEscalation[] => {
    validateIpc(IPC_CHANNELS.OUTAGE_GET_ESCALATIONS, []);
    const envs = getEnvironments();
    const result: OutageEscalation[] = [];
    for (const env of envs) {
      if (outageTracker.isEscalated(env.id)) {
        const since = outageTracker.getOutageSince(env.id);
        if (since) {
          result.push({
            environmentId: env.id,
            since: new Date(since).toISOString(),
            durationMs: Date.now() - since,
          });
        }
      }
    }
    return result;
  });

  // ── Reachability (instance health layer, separate from loop status) ───

  safeHandle(IPC_CHANNELS.REACHABILITY_GET_STATUS, (_event, ...rawArgs): ReachabilityStatus | null => {
    const [environmentId] = validateIpc<[string]>(IPC_CHANNELS.REACHABILITY_GET_STATUS, rawArgs);
    return reachabilityTracker.getStatus(environmentId);
  });

  safeHandle(IPC_CHANNELS.REACHABILITY_GET_ALL, (): ReachabilityStatus[] => {
    validateIpc(IPC_CHANNELS.REACHABILITY_GET_ALL, []);
    return reachabilityTracker.getAll();
  });

  // ── Transcript IPC handlers ──────────────────────────────────────────

  safeHandle(IPC_CHANNELS.TRANSCRIPT_GET_MESSAGES, async (_event, ...rawArgs) => {
    const [sessionId] = validateIpc<[string]>(IPC_CHANNELS.TRANSCRIPT_GET_MESSAGES, rawArgs);
    return transcriptGetMessages(sessionId);
  });

  safeHandle(IPC_CHANNELS.TRANSCRIPT_APPEND_MESSAGE, async (_event, ...rawArgs) => {
    const [message] = validateIpc<[Omit<TranscriptMessage, "createdAt">]>(IPC_CHANNELS.TRANSCRIPT_APPEND_MESSAGE, rawArgs);
    return transcriptAppendMessage(message);
  });

  safeHandle(IPC_CHANNELS.TRANSCRIPT_APPEND_MESSAGES, async (_event, ...rawArgs) => {
    const [messages] = validateIpc<[Array<Omit<TranscriptMessage, "createdAt">>]>(IPC_CHANNELS.TRANSCRIPT_APPEND_MESSAGES, rawArgs);
    return transcriptAppendMessages(messages);
  });

  safeHandle(IPC_CHANNELS.TRANSCRIPT_UPDATE_MESSAGE, async (_event, ...rawArgs) => {
    const [messageId, updates] = validateIpc<[string, Partial<Pick<TranscriptMessage, "content" | "toolCalls" | "finishedAt">>  ]>(IPC_CHANNELS.TRANSCRIPT_UPDATE_MESSAGE, rawArgs);
    await transcriptUpdateMessage(messageId, updates);
  });

  safeHandle(IPC_CHANNELS.TRANSCRIPT_DELETE_SESSION, async (_event, ...rawArgs) => {
    const [sessionId] = validateIpc<[string]>(IPC_CHANNELS.TRANSCRIPT_DELETE_SESSION, rawArgs);
    await transcriptDeleteSession(sessionId);
  });

  // ── MCP (loop-task daemon MCP server) ────────────────────────────────

  safeHandle(IPC_CHANNELS.MCP_GET_STATUS, (_event, ...rawArgs): McpConnectionStatus => {
    const [environmentId] = validateIpc<[string]>(IPC_CHANNELS.MCP_GET_STATUS, rawArgs);
    return getMcpStatus(environmentId);
  });

  safeHandle(IPC_CHANNELS.MCP_CONNECT, async (_event, ...rawArgs): Promise<McpConnectionStatus> => {
    const [environmentId] = validateIpc<[string]>(IPC_CHANNELS.MCP_CONNECT, rawArgs);
    return connectMcp(environmentId);
  });

  safeHandle(IPC_CHANNELS.MCP_DISCONNECT, async (_event, ...rawArgs): Promise<void> => {
    const [environmentId] = validateIpc<[string]>(IPC_CHANNELS.MCP_DISCONNECT, rawArgs);
    await disconnectMcp(environmentId);
  });

  safeHandle(IPC_CHANNELS.MCP_CALL_TOOL, async (_event, ...rawArgs): Promise<McpToolCallResult> => {
    const [environmentId, toolName, args] = validateIpc<[string, string, Record<string, unknown>]>(IPC_CHANNELS.MCP_CALL_TOOL, rawArgs);
     return callMcpTool(environmentId, toolName, args);
  });

  // ── Agent streaming (OpenCode runtime) ─────────────────────────────
  safeHandle(IPC_CHANNELS.AGENT_SEND_PROMPT, async (_event, ...rawArgs) => {
    const [args] = validateIpc<[AgentSendPromptArgs]>(IPC_CHANNELS.AGENT_SEND_PROMPT, rawArgs);
    return sendPromptToAgent(args);
  });

  safeHandle(IPC_CHANNELS.AGENT_INTERRUPT, async (_event, ...rawArgs) => {
    const [environmentId, sessionId] = validateIpc<[string, string | undefined]>(IPC_CHANNELS.AGENT_INTERRUPT, rawArgs);
    return interruptAgent(environmentId, sessionId);
  });

  safeHandle(IPC_CHANNELS.AGENT_LIST_MODELS, async (_event, ...rawArgs) => {
    const [environmentId] = validateIpc<[string]>(IPC_CHANNELS.AGENT_LIST_MODELS, rawArgs);
    return listModelsForEnvironment(environmentId);
  });

  // ── Loop shape cache IPC handlers ──────────────────────────────────

  safeHandle(IPC_CHANNELS.LOOP_SHAPE_CACHE_GET_CACHED, (_event, ...rawArgs): LoopShape[] => {
    const [environmentId] = validateIpc<[string]>(IPC_CHANNELS.LOOP_SHAPE_CACHE_GET_CACHED, rawArgs);
    return getLoopShapeCached(environmentId);
  });

  safeHandle(IPC_CHANNELS.LOOP_SHAPE_CACHE_GET_ALL, (): LoopShape[] => {
    validateIpc(IPC_CHANNELS.LOOP_SHAPE_CACHE_GET_ALL, []);
    return getAllLoopShapeCached();
  });

  safeHandle(IPC_CHANNELS.LOOP_SHAPE_CACHE_REFRESH, async (_event, ...rawArgs): Promise<LoopShape[]> => {
    const [environmentId] = validateIpc<[string]>(IPC_CHANNELS.LOOP_SHAPE_CACHE_REFRESH, rawArgs);
    return refreshLoopShapesForEnvironment(environmentId);
  });

  // ── Sibling decline store ──────────────────────────────────────────
  safeHandle(IPC_CHANNELS.SIBLING_DECLINE_IS_DECLINED, (_event, ...rawArgs): boolean => {
    const [environmentId, loopId, fingerprint] = validateIpc<[string, string, string]>(IPC_CHANNELS.SIBLING_DECLINE_IS_DECLINED, rawArgs);
    return isSiblingDeclined(environmentId, loopId, fingerprint);
  });

  safeHandle(IPC_CHANNELS.SIBLING_DECLINE_RECORD_DECLINE, (_event, ...rawArgs): void => {
    const [record] = validateIpc<[{ environmentId: string; loopId: string; fingerprint: string }]>(IPC_CHANNELS.SIBLING_DECLINE_RECORD_DECLINE, rawArgs);
    recordSiblingDecline(record.environmentId, record.loopId, record.fingerprint);
  });

  // ── Global settings ──
  safeHandle(IPC_CHANNELS.SETTINGS_GET, (): GlobalSettings => {
    return getGlobalSettings();
  });

  safeHandle(IPC_CHANNELS.SETTINGS_UPDATE, async (_event, ...rawArgs): Promise<void> => {
    const [updates] = validateIpc<[Partial<GlobalSettings>]>(IPC_CHANNELS.SETTINGS_UPDATE, rawArgs);
    await updateGlobalSettings(updates);
  });

  // Prune old breaches on startup
  void pruneOldBreaches();

  // Initialize the loop-shape cache and trigger a refresh for all connected environments
  initLoopShapeCache();

  void autoPromoteFirstEnvIfNeeded();
  createWindow();

  // Dispatch any pending deep-link from a cold-start notification click
  setTimeout(() => notificationService.dispatchPendingDeepLink(), 1500);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  for (const entry of streams.values()) entry.controller.abort();
  streams.clear();
  streamEnvironments.clear();
  for (const supervisor of supervisors.values()) supervisor.destroy();
  supervisors.clear();
  for (const tracker of endpointTrackers.values()) tracker.destroy();
  endpointTrackers.clear();
  destroyAllOpenCodeStatus();
  void closeAllRegistryTunnels();
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", async () => {
  await closeAllRegistryTunnels();
});

process.on("exit", () => {
  forceKillAllRegistryTunnels();
});

const SENSITIVE_LOG_CONTEXT_KEY = /password|secret|token|credential|authorization|cookie/i;

function formatLogContext(context: Record<string, SerializableValue> | undefined): string {
  if (!context) return "";
  try {
    const serialized = JSON.stringify(context, (key, value: unknown) =>
      SENSITIVE_LOG_CONTEXT_KEY.test(key) ? "[REDACTED]" : value,
    );
    return serialized ? ` ${serialized.slice(0, 10_000)}` : "";
  } catch {
    return " [Unserializable context]";
  }
}
