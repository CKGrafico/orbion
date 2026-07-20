import { app, BrowserWindow, ipcMain, shell, dialog, Menu } from "electron";
import path from "node:path";
import fs from "node:fs";
import { logger, createLogger } from "./logger.js";
import type { LogEntry } from "../shared/log.js";
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
  updateMessageInSession as transcriptUpdateMessageInSession,
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
import { validateIpc, safeHandle, IpcValidationError } from "./ipc-validation.js";
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

const streams = new Map<string, AbortController>();
const streamEnvironments = new Map<string, string>();

const notificationService = new NotificationService();

const outageTracker = new OutageTracker(
  (event: OutageEscalation) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("outage:escalation", event);
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
      win.webContents.send("outage:resolve", environmentId);
    }
  },
);

const reachabilityTracker = new ReachabilityTracker();

// Forward loop-shape cache updates to the renderer
onLoopShapeCacheUpdate((shapes: LoopShape[]) => {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send("loopShapeCache:update", shapes);
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
         win.webContents.send("connection:status", environmentId, status);
       }
       // Feed status changes to the outage tracker
       outageTracker.handleStatusChange(environmentId, status);
       // Feed status changes to the reachability tracker (its own health layer)
       reachabilityTracker.handleConnectionPhaseChange(environmentId, status.phase);
       // Forward reachability changes to the renderer
       const reachabilityStatus = reachabilityTracker.getStatus(environmentId);
       if (reachabilityStatus && win && !win.isDestroyed()) {
         win.webContents.send("reachability:status", reachabilityStatus);
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
          win.webContents.send("connection:endpointHealth", environmentId, health);
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
      streams.get(subId)?.abort();
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
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
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
        sender.send("stream:event", { subId: args.subId, kind, text });
      }
    };
    send("error", "Base URL not registered as an environment");
    return;
  }

  const controller = new AbortController();
  streams.set(args.subId, controller);
  streamEnvironments.set(args.subId, envId);

  const send = (kind: "data" | "event" | "end" | "error", text: string): void => {
    if (!sender.isDestroyed()) {
      sender.send("stream:event", { subId: args.subId, kind, text });
    }
  };

  const token = getSessionToken(envId);

  const streamHeaders: Record<string, string> = { Accept: "text/event-stream" };
  if (token) streamHeaders["Authorization"] = `Bearer ${token.accessToken}`;

  // For SSH endpoints, resolve the effective (tunneled) URL.
  const effectiveBaseUrl = resolveEffectiveUrlForBaseUrl(envId, args.baseUrl);

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

interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

function boundsFile(): string {
  return path.join(app.getPath("userData"), "window-bounds.json");
}

function loadBounds(): WindowBounds {
  try {
    const raw = fs.readFileSync(boundsFile(), "utf8");
    const parsed = JSON.parse(raw) as WindowBounds;
    if (typeof parsed.width === "number" && typeof parsed.height === "number") return parsed;
    logger.warn("[bounds] Invalid bounds file content, using defaults");
  } catch (err) {
    // first launch or corrupt file, use defaults
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

async function seedSupervisors(): Promise<void> {
  for (const env of getEnvironments()) {
    // Open SSH tunnels for all SSH-reach endpoints before resolving the URL.
    // The tunnel translates the remote host:port into a local loopback port.
    await openTunnelsForEnvironment(env.id, env.endpoints, env.activeEndpointId);

    // Use the effective URL (tunneled for SSH endpoints, raw for others).
    const activeEp = env.activeEndpointId
      ? env.endpoints.find((e) => e.id === env.activeEndpointId)
      : env.endpoints[0];
    const url = activeEp ? resolveEffectiveUrl(env.id, activeEp) : resolveActiveUrl(env.endpoints, env.activeEndpointId);
    if (url) {
      getOrCreateSupervisor(env.id, url);
    }
    syncEndpointTracker(env.id);
    if (env.opencode) {
      void refreshOpenCodeStatus(env.id, env.opencode);
    }
    // Connect to the environment's MCP server (fire-and-forget)
    void connectMcp(env.id);
    // Refresh loop-shape cache for this environment (fire-and-forget)
    void refreshLoopShapesForEnvironment(env.id);
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
      preload: path.join(import.meta.dirname, "../preload/index.mjs"),
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

  ipcMain.handle("log:write", (_event, rawEntry: unknown) => {
    if (!isLogEntry(rawEntry)) {
      logger.warn("Rejected invalid renderer log entry");
      return;
    }
    const scopedLogger = rawEntry.module ? createLogger(rawEntry.module.slice(0, 100)) : logger;
    scopedLogger[rawEntry.level](`${rawEntry.message.slice(0, 10_000)}${formatLogContext(rawEntry.context)}`);
  });

  safeHandle("api:request", (_event, ...rawArgs) => {
    const [args] = validateIpc<[ApiRequestArgs]>("api:request", rawArgs);
    return handleApiRequest(args);
  });

  safeHandle("stream:subscribe", (event, ...rawArgs) => {
    const [args] = validateIpc<[StreamSubscribeArgs]>("stream:subscribe", rawArgs);
    void handleStreamSubscribe(event.sender, args);
  });

  safeHandle("stream:unsubscribe", (_event, ...rawArgs) => {
    const [subId] = validateIpc<[string]>("stream:unsubscribe", rawArgs);
    streams.get(subId)?.abort();
    streams.delete(subId);
    streamEnvironments.delete(subId);
  });

  safeHandle("config:getEnvironments", () => {
    validateIpc("config:getEnvironments", []);
    return getEnvironmentsForRenderer();
  });
  safeHandle("config:addEnvironment", async (_event, ...rawArgs) => {
    const [name, url, kind] = validateIpc<[string, string, string | undefined]>("config:addEnvironment", rawArgs);
    const endpointKind = (kind as "direct" | "ssh" | "tailscale") ?? "direct";
    const fingerprint = await fetchFingerprint(url);
    if (fingerprint) {
      const existing = findEnvironmentByFingerprint(fingerprint.id);
      if (existing) {
        const ep = await addEndpoint(existing.id, url, endpointKind);
        syncEndpointTracker(existing.id);
        // Open SSH tunnel if needed
        if (ep) {
          await openTunnelsForEnvironment(existing.id, [...existing.endpoints, ep], ep.id);
        }
        const activeEp = ep ?? existing.endpoints.find((e) => e.id === existing.activeEndpointId);
        const activeUrl = activeEp ? resolveEffectiveUrl(existing.id, activeEp) : resolveActiveUrl(existing.endpoints, ep?.id ?? existing.activeEndpointId);
        if (activeUrl) getOrCreateSupervisor(existing.id, activeUrl);
        return existing;
      }
    }
    const env = await addEnvironment(name, url, endpointKind);
    if (fingerprint) {
      await setEnvironmentFingerprintId(env.id, fingerprint.id);
    }
    await autoPromoteFirstEnvIfNeeded();
    // Open SSH tunnel if needed
    await openTunnelsForEnvironment(env.id, env.endpoints, env.activeEndpointId);
    const activeEp = env.activeEndpointId
      ? env.endpoints.find((e) => e.id === env.activeEndpointId)
      : env.endpoints[0];
    const activeUrl = activeEp ? resolveEffectiveUrl(env.id, activeEp) : resolveActiveUrl(env.endpoints, env.activeEndpointId);
    if (activeUrl) getOrCreateSupervisor(env.id, activeUrl);
    syncEndpointTracker(env.id);
    return env;
  });
  safeHandle("config:exchangePairingCode", async (_event, ...rawArgs) => {
    const [baseUrl, code, scope] = validateIpc<[string, string, string | undefined]>("config:exchangePairingCode", rawArgs);
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
  safeHandle("config:removeSessionToken", async (_event, ...rawArgs) => {
    const [environmentId] = validateIpc<[string]>("config:removeSessionToken", rawArgs);
    await removeSessionToken(environmentId);
  });
  safeHandle("config:removeEnvironment", async (_event, ...rawArgs) => {
    const [id] = validateIpc<[string]>("config:removeEnvironment", rawArgs);
    removeSupervisor(id);
    clearOpenCodeStatus(id);
    removeMcpSession(id);
    removeEnvironmentShapes(id);
    abortStreamsForEnvironment(id);
    await removeEnvironment(id);
  });
  safeHandle("config:updateEnvironment", async (_event, ...rawArgs) => {
    const [id, updates] = validateIpc<[string, { name?: string; agentRuntime?: AgentRuntime }]>("config:updateEnvironment", rawArgs);
    await updateEnvironment(id, updates);
  });
  safeHandle("config:addEndpoint", async (_event, ...rawArgs) => {
    const [environmentId, url, kind] = validateIpc<[string, string, string]>("config:addEndpoint", rawArgs);
    const ep = await addEndpoint(environmentId, url, kind as "direct" | "ssh" | "tailscale");
    if (ep && ep.kind === "ssh") {
      await openTunnelForEndpoint(environmentId, ep);
    }
    syncEndpointTracker(environmentId);
    return ep;
  });
  safeHandle("config:removeEndpoint", async (_event, ...rawArgs) => {
    const [environmentId, endpointId] = validateIpc<[string, string]>("config:removeEndpoint", rawArgs);
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
  safeHandle("config:setActiveEndpoint", async (_event, ...rawArgs) => {
    const [environmentId, endpointId] = validateIpc<[string, string]>("config:setActiveEndpoint", rawArgs);
    await setActiveEndpoint(environmentId, endpointId);
    const envs = getEnvironments();
    const env = envs.find((e: Environment) => e.id === environmentId);
    if (env) {
      // Open SSH tunnel for the new active endpoint if needed
      await openTunnelsForEnvironment(environmentId, env.endpoints, endpointId);
      const activeEp = env.endpoints.find((e) => e.id === endpointId);
      const url = activeEp ? resolveEffectiveUrl(environmentId, activeEp) : resolveActiveUrl(env.endpoints, endpointId);
      if (url) {
        removeSupervisor(environmentId);
        // Re-open tunnels since removeSupervisor closed them
        await openTunnelsForEnvironment(environmentId, env.endpoints, endpointId);
        const activeEpRetry = env.endpoints.find((e) => e.id === endpointId);
        const tunnelUrl = activeEpRetry ? resolveEffectiveUrl(environmentId, activeEpRetry) : resolveActiveUrl(env.endpoints, endpointId);
        if (tunnelUrl) {
          getOrCreateSupervisor(environmentId, tunnelUrl);
        }
      }
      // Reconnect MCP to the new endpoint's MCP server (fire-and-forget)
      void connectMcp(environmentId);
    }
    syncEndpointTracker(environmentId);
  });
  safeHandle("config:getSelectedEnvironmentId", () => {
    validateIpc("config:getSelectedEnvironmentId", []);
    return getSelectedEnvironmentId();
  });
  safeHandle("config:setSelectedEnvironmentId", async (_event, ...rawArgs) => {
    const [id] = validateIpc<[string | null]>("config:setSelectedEnvironmentId", rawArgs);
    return setSelectedEnvironmentId(id);
  });
  safeHandle(
    "config:migrateFromLocalStorage",
    async (_event, ...rawArgs) => {
      const [rawInstances, rawSelectedId] = validateIpc<[string, string | null]>("config:migrateFromLocalStorage", rawArgs);
      return migrateFromLocalStorage(rawInstances, rawSelectedId);
    },
  );

  safeHandle("connection:getStatus", (_event, ...rawArgs) => {
    const [environmentId] = validateIpc<[string]>("connection:getStatus", rawArgs);
    const supervisor = supervisors.get(environmentId);
    return supervisor ? supervisor.getStatus() : null;
  });

  safeHandle("connection:getEndpointHealth", (_event, ...rawArgs): EndpointHealth[] => {
    const [environmentId] = validateIpc<[string]>("connection:getEndpointHealth", rawArgs);
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

  safeHandle("connection:retry", (_event, ...rawArgs) => {
    const [environmentId] = validateIpc<[string]>("connection:retry", rawArgs);
    const supervisor = supervisors.get(environmentId);
    if (supervisor) supervisor.wakeup();
  });

  ipcMain.on("connection:networkChanged", (_event, ...rawArgs) => {
    try {
      const [online] = validateIpc<[boolean]>("connection:networkChanged", rawArgs);
      setOsOffline(!online);
    } catch (err) {
      if (err instanceof IpcValidationError) {
        logger.error(`[IPC] ${err.message}`);
        return;
      }
      throw err;
    }
  });

  safeHandle("tailscale:peers", () => {
    validateIpc("tailscale:peers", []);
    return fetchPeers();
  });

  safeHandle("vmWizard:listSshHosts", () => {
    validateIpc("vmWizard:listSshHosts", []);
    return vmListSshHosts();
  });

  safeHandle("vmWizard:start", async (_event, ...rawArgs) => {
    const [options] = validateIpc<[VmWizardStartOptions]>("vmWizard:start", rawArgs);
    const result = await runWizard(options);
    // After the wizard creates the environment, open SSH tunnels and
    // seed the connection supervisor so the new environment is immediately live.
    const envs = getEnvironments();
    const env = envs.find((e: Environment) => e.id === result.environmentId);
    if (env) {
      await openTunnelsForEnvironment(env.id, env.endpoints, env.activeEndpointId);
      const activeEp = env.activeEndpointId
        ? env.endpoints.find((e) => e.id === env.activeEndpointId)
        : env.endpoints[0];
      const activeUrl = activeEp ? resolveEffectiveUrl(env.id, activeEp) : resolveActiveUrl(env.endpoints, env.activeEndpointId);
      if (activeUrl) getOrCreateSupervisor(env.id, activeUrl);
      syncEndpointTracker(env.id);
      // Connect to the new environment's MCP server (fire-and-forget)
      void connectMcp(env.id);
    }
    return result;
  });

  safeHandle("vmWizard:cancel", () => {
    validateIpc("vmWizard:cancel", []);
    cancelWizard();
  });

  safeHandle("vmWizard:respondConsent", (_event, ...rawArgs) => {
    const [decision] = validateIpc<["install" | "skip"]>("vmWizard:respondConsent", rawArgs);
    respondConsent(decision);
  });

  safeHandle("vmWizard:respondServiceSelection", (_event, ...rawArgs) => {
    const [selection] = validateIpc<[import("../shared/ipc.js").VmWizardServiceSelection]>("vmWizard:respondServiceSelection", rawArgs);
    respondServiceSelection(selection);
  });

  safeHandle("vmWizard:respondRuntimeConsent", (_event, ...rawArgs) => {
    const [decision] = validateIpc<["install" | "skip"]>("vmWizard:respondRuntimeConsent", rawArgs);
    respondRuntimeConsent(decision);
  });

  safeHandle("vmWizard:respondHostKey", (_event, ...rawArgs) => {
    const [accepted] = validateIpc<[boolean]>("vmWizard:respondHostKey", rawArgs);
    respondHostKey(accepted);
  });

  safeHandle("opencode:getStatus", (_event, ...rawArgs): OpenCodeConnectionStatus => {
    const [environmentId] = validateIpc<[string]>("opencode:getStatus", rawArgs);
    return getOpenCodeStatus(environmentId);
  });

  safeHandle("opencode:refreshStatus", async (_event, ...rawArgs): Promise<OpenCodeConnectionStatus> => {
    const [environmentId] = validateIpc<[string]>("opencode:refreshStatus", rawArgs);
    const envs = getEnvironments();
    const env = envs.find((e: Environment) => e.id === environmentId);
    if (!env?.opencode) {
      return getOpenCodeStatus(environmentId);
    }
    return refreshOpenCodeStatus(environmentId, env.opencode);
  });

  safeHandle("config:setOpenCodeEndpoint", async (_event, ...rawArgs) => {
    const [environmentId, endpoint] = validateIpc<[string, OpenCodeEndpoint | null]>("config:setOpenCodeEndpoint", rawArgs);
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

  safeHandle("config:setInfraOpenCodeEndpoint", async (_event, ...rawArgs) => {
    const [environmentId, endpoint] = validateIpc<[string, OpenCodeEndpoint | null]>("config:setInfraOpenCodeEndpoint", rawArgs);
    const result = await setInfraOpenCodeEndpoint(environmentId, endpoint);
    if (!result.ok && result.reason === "encryption-unavailable") {
      showEncryptionWarning();
    }
    return result;
  });

  safeHandle("config:setMainVm", async (_event, ...rawArgs) => {
    const [environmentId] = validateIpc<[string]>("config:setMainVm", rawArgs);
    await setMainVm(environmentId);
  });

  safeHandle("config:getMainVmId", () => {
    validateIpc("config:getMainVmId", []);
    return getMainVmId();
  });

  safeHandle("config:getProjectPickupLabels", (_event, ...rawArgs) => {
    const [projectId] = validateIpc<[string]>("config:getProjectPickupLabels", rawArgs);
    return getProjectPickupLabels(projectId);
  });

  safeHandle("config:setProjectPickupLabels", async (_event, ...rawArgs) => {
    const [projectId, labels] = validateIpc<[string, string[]]>("config:setProjectPickupLabels", rawArgs);
    await setProjectPickupLabels(projectId, labels);
  });

  safeHandle("config:getProjectPipelineLabels", (_event, ...rawArgs) => {
    const [projectId] = validateIpc<[string]>("config:getProjectPipelineLabels", rawArgs);
    return getProjectPipelineLabels(projectId);
  });

  safeHandle("config:setProjectPipelineLabels", async (_event, ...rawArgs) => {
    const [projectId, labels] = validateIpc<[string, string[]]>("config:setProjectPipelineLabels", rawArgs);
    await setProjectPipelineLabels(projectId, labels);
  });

  safeHandle("config:getChatSessions", () => {
    return getChatSessions();
  });

  safeHandle("config:addChatSession", async (_event, ...rawArgs) => {
    const [session] = validateIpc<[Omit<import("../shared/ipc").ChatSession, "id" | "createdAt">]>("config:addChatSession", rawArgs);
    return addChatSession(session);
  });

  safeHandle("config:removeChatSession", async (_event, ...rawArgs) => {
    const [sessionId] = validateIpc<[string]>("config:removeChatSession", rawArgs);
    await removeChatSession(sessionId);
    await transcriptDeleteSession(sessionId);
  });

  safeHandle("config:updateChatSession", async (_event, ...rawArgs) => {
    const [sessionId, updates] = validateIpc<[string, Partial<Pick<import("../shared/ipc").ChatSession, "title" | "lastActiveAt" | "projectName" | "environmentId" | "workingDirectory" | "activeRuntime" | "activeModel" | "reasoningEffort" | "persisted" | "turnCount" | "declineAutoPersistUntil">>]>("config:updateChatSession", rawArgs);
    await updateChatSession(sessionId, updates);
  });

  safeHandle("config:getExpandedProjects", () => {
    return getExpandedProjects();
  });

  safeHandle("config:setExpandedProjects", async (_event, ...rawArgs) => {
    const [expandedKeys] = validateIpc<[string[]]>("config:setExpandedProjects", rawArgs);
    await setExpandedProjects(expandedKeys);
  });

  safeHandle("config:exportBootstrapSeed", () => {
    validateIpc("config:exportBootstrapSeed", []);
    return exportBootstrapSeed();
  });

  safeHandle("config:importBootstrapSeed", (_event, ...rawArgs) => {
    const [seedString] = validateIpc<[string]>("config:importBootstrapSeed", rawArgs);
    return importBootstrapSeed(seedString);
  });

  safeHandle("config:checkRestoreAvailable", () => {
    validateIpc("config:checkRestoreAvailable", []);
    return checkRestoreAvailable();
  });

  safeHandle("config:pullRestore", async () => {
    validateIpc("config:pullRestore", []);
    const result = await pullRestore();

    // After a successful restore, seed supervisors and tunnels for the new environments
    if (result.ok) {
      for (const env of result.restored) {
        await openTunnelsForEnvironment(env.id, env.endpoints, env.activeEndpointId);
        const activeEp = env.activeEndpointId
          ? env.endpoints.find((e) => e.id === env.activeEndpointId)
          : env.endpoints[0];
        const url = activeEp ? resolveEffectiveUrl(env.id, activeEp) : resolveActiveUrl(env.endpoints, env.activeEndpointId);
        if (url) getOrCreateSupervisor(env.id, url);
        syncEndpointTracker(env.id);
        // Connect to the new environment's MCP server (fire-and-forget)
        void connectMcp(env.id);
      }
    }

    return result;
  });

  safeHandle("config:getConfigStamp", (): ConfigStamp => {
    validateIpc("config:getConfigStamp", []);
    return getConfigStamp();
  });

  safeHandle("config:stampCheckedSetMainVm", async (_event, ...rawArgs): Promise<StampCheckedWriteResult> => {
    const [environmentId, knownStamp] = validateIpc<[string, ConfigStamp]>("config:stampCheckedSetMainVm", rawArgs);
    return stampCheckedSetMainVm(environmentId, knownStamp);
  });

  safeHandle("config:forceSetMainVm", async (_event, ...rawArgs): Promise<ConfigStamp> => {
    const [environmentId] = validateIpc<[string]>("config:forceSetMainVm", rawArgs);
    return forceSetMainVm(environmentId);
  });

  safeHandle("config:sweepEphemeralSessions", async (_event, ...rawArgs): Promise<import("../shared/ipc").SweepEphemeralSessionsResult> => {
    const [args] = validateIpc<[import("../shared/ipc").SweepEphemeralSessionsArgs]>("config:sweepEphemeralSessions", rawArgs);
    // Also delete transcripts for swept sessions
    const result = await sweepEphemeralSessions(args);
    for (const sessionId of result.removedSessionIds) {
      try { await transcriptDeleteSession(sessionId); } catch { /* best-effort */ }
    }
    return result;
  });


  // ── Infra action handlers (delegated to infra-handlers.ts) ──────────

  safeHandle("infra:executeAction", async (_event, ...rawArgs): Promise<InfraActionResult> => {
    const [args] = validateIpc<[InfraActionArgs]>("infra:executeAction", rawArgs);
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

  safeHandle("infra:getStatus", () => {
    validateIpc("infra:getStatus", []);
    const mainVmId = getMainVmId();
    const connected = mainVmId !== null && supervisors.has(mainVmId)
      && supervisors.get(mainVmId)!.getStatus().phase === "connected";
    return { mainVmId, connected };
  });

  safeHandle("infra:getPlatform", (_event, ...rawArgs): PlatformType => {
    const [environmentId, projectId] = validateIpc<[string, string]>("infra:getPlatform", rawArgs);
    const key = platformCacheKey(environmentId, projectId);
    return platformCache.get(key) ?? "unknown";
  });

  // ── Budget watch IPC handlers ───────────────────────────────────────

  safeHandle("budget:getWatches", (): BudgetWatch[] => {
    validateIpc("budget:getWatches", []);
    return getBudgetWatches();
  });

  safeHandle("budget:addWatch", async (_event, ...rawArgs): Promise<BudgetWatch> => {
    const [watch] = validateIpc<[Omit<BudgetWatch, "id" | "createdAt">]>("budget:addWatch", rawArgs);
    return addBudgetWatch(watch);
  });

  safeHandle("budget:removeWatch", async (_event, ...rawArgs): Promise<void> => {
    const [watchId] = validateIpc<[string]>("budget:removeWatch", rawArgs);
    await removeBudgetWatch(watchId);
  });

  safeHandle("budget:updateWatch", async (_event, ...rawArgs): Promise<void> => {
    const [watchId, updates] = validateIpc<[string, Partial<Pick<BudgetWatch, "threshold" | "autoPause" | "enabled">>]>("budget:updateWatch", rawArgs);
    await updateBudgetWatch(watchId, updates);
  });

  safeHandle("budget:getBreaches", (): BudgetBreach[] => {
    validateIpc("budget:getBreaches", []);
    return getBudgetBreaches();
  });

  safeHandle("budget:addBreach", async (_event, ...rawArgs): Promise<BudgetBreach> => {
    const [breach] = validateIpc<[Omit<BudgetBreach, "id">]>("budget:addBreach", rawArgs);
    return addBudgetBreach(breach);
  });

  safeHandle("budget:dismissBreach", async (_event, ...rawArgs): Promise<void> => {
    const [breachId] = validateIpc<[string]>("budget:dismissBreach", rawArgs);
    await dismissBudgetBreach(breachId);
  });

  // ── Inbox ──────────────────────────────────────────────────────────

  safeHandle("inbox:getItems", (): InboxItem[] => {
    validateIpc("inbox:getItems", []);
    // Inbox items are derived from existing data + dismissed state.
    // The renderer computes the actual item list from perEnvLoops/breaches;
    // the main process only tracks which items the user has dismissed.
    // We return an empty array here; the real assembly happens in the renderer.
    // This channel exists so the dismiss state is queryable via IPC.
    return [];
  });

  safeHandle("inbox:dismissItem", async (_event, ...rawArgs): Promise<void> => {
    const [itemId] = validateIpc<[string]>("inbox:dismissItem", rawArgs);
    await dismissInboxItem(itemId);
  });

  safeHandle("inbox:queryFleet", async (_event, ..._rawArgs): Promise<InboxQueryResult> => {
    // Fleet queries are computed entirely in the renderer from live data.
    // The main process provides the dismissed-IDs list so the renderer
    // can filter out acknowledged items.
    // Return minimal result; the renderer InboxService enriches it
    return { answer: "", references: [] };
  });

  safeHandle("inbox:resolveItem", async (_event, ...rawArgs): Promise<void> => {
    const [resolved] = validateIpc<[ResolvedInboxItem]>("inbox:resolveItem", rawArgs);
    await addResolvedItem(resolved);
  });

  safeHandle("inbox:getResolvedItems", (): ResolvedInboxItem[] => {
    validateIpc("inbox:getResolvedItems", []);
    return getResolvedItems();
  });

  safeHandle("inbox:pruneResolvedItems", async (): Promise<void> => {
    await pruneResolvedItems();
  });

  // ── Native OS notifications ─────────────────────────────────────────

  safeHandle("notification:send", (_event, ...rawArgs): void => {
    const [args] = validateIpc<[NotificationSendArgs]>("notification:send", rawArgs);
    notificationService.send(args);
  });

  safeHandle("notification:setMuted", (_event, ...rawArgs): void => {
    const [muted] = validateIpc<[boolean]>("notification:setMuted", rawArgs);
    notificationService.setMuted(muted);
  });

  safeHandle("notification:isMuted", (): boolean => {
    validateIpc("notification:isMuted", []);
    return notificationService.isMuted();
  });

  // ── Outage escalation ────────────────────────────────────────────

  safeHandle("outage:getEscalations", (): OutageEscalation[] => {
    validateIpc("outage:getEscalations", []);
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

  safeHandle("reachability:getStatus", (_event, ...rawArgs): ReachabilityStatus | null => {
    const [environmentId] = validateIpc<[string]>("reachability:getStatus", rawArgs);
    return reachabilityTracker.getStatus(environmentId);
  });

  safeHandle("reachability:getAll", (): ReachabilityStatus[] => {
    validateIpc("reachability:getAll", []);
    return reachabilityTracker.getAll();
  });

  // ── Transcript IPC handlers ──────────────────────────────────────────

  safeHandle("transcript:getMessages", async (_event, ...rawArgs) => {
    const [sessionId] = validateIpc<[string]>("transcript:getMessages", rawArgs);
    return transcriptGetMessages(sessionId);
  });

  safeHandle("transcript:appendMessage", async (_event, ...rawArgs) => {
    const [message] = validateIpc<[Omit<TranscriptMessage, "createdAt">]>("transcript:appendMessage", rawArgs);
    return transcriptAppendMessage(message);
  });

  safeHandle("transcript:appendMessages", async (_event, ...rawArgs) => {
    const [messages] = validateIpc<[Array<Omit<TranscriptMessage, "createdAt">>]>("transcript:appendMessages", rawArgs);
    return transcriptAppendMessages(messages);
  });

  safeHandle("transcript:updateMessage", async (_event, ...rawArgs) => {
    const [messageId, updates] = validateIpc<[string, Partial<Pick<TranscriptMessage, "content" | "toolCalls" | "finishedAt">>  ]>("transcript:updateMessage", rawArgs);
    await transcriptUpdateMessage(messageId, updates);
  });

  safeHandle("transcript:deleteSession", async (_event, ...rawArgs) => {
    const [sessionId] = validateIpc<[string]>("transcript:deleteSession", rawArgs);
    await transcriptDeleteSession(sessionId);
  });

  // ── MCP (loop-task daemon MCP server) ────────────────────────────────

  safeHandle("mcp:getStatus", (_event, ...rawArgs): McpConnectionStatus => {
    const [environmentId] = validateIpc<[string]>("mcp:getStatus", rawArgs);
    return getMcpStatus(environmentId);
  });

  safeHandle("mcp:connect", async (_event, ...rawArgs): Promise<McpConnectionStatus> => {
    const [environmentId] = validateIpc<[string]>("mcp:connect", rawArgs);
    return connectMcp(environmentId);
  });

  safeHandle("mcp:disconnect", async (_event, ...rawArgs): Promise<void> => {
    const [environmentId] = validateIpc<[string]>("mcp:disconnect", rawArgs);
    await disconnectMcp(environmentId);
  });

  safeHandle("mcp:callTool", async (_event, ...rawArgs): Promise<McpToolCallResult> => {
    const [environmentId, toolName, args] = validateIpc<[string, string, Record<string, unknown>]>("mcp:callTool", rawArgs);
     return callMcpTool(environmentId, toolName, args);
  });

  // ── Agent streaming (OpenCode runtime) ─────────────────────────────
  safeHandle("agent:sendPrompt", async (_event, ...rawArgs) => {
    const [args] = validateIpc<[AgentSendPromptArgs]>("agent:sendPrompt", rawArgs);
    return sendPromptToAgent(args);
  });

  safeHandle("agent:interrupt", async (_event, ...rawArgs) => {
    const [environmentId, sessionId] = validateIpc<[string, string | undefined]>("agent:interrupt", rawArgs);
    return interruptAgent(environmentId, sessionId);
  });

  safeHandle("agent:listModels", async (_event, ...rawArgs) => {
    const [environmentId] = validateIpc<[string]>("agent:listModels", rawArgs);
    return listModelsForEnvironment(environmentId);
  });

  // ── Loop shape cache IPC handlers ──────────────────────────────────

  safeHandle("loopShapeCache:getCached", (_event, ...rawArgs): LoopShape[] => {
    const [environmentId] = validateIpc<[string]>("loopShapeCache:getCached", rawArgs);
    return getLoopShapeCached(environmentId);
  });

  safeHandle("loopShapeCache:getAll", (): LoopShape[] => {
    validateIpc("loopShapeCache:getAll", []);
    return getAllLoopShapeCached();
  });

  safeHandle("loopShapeCache:refresh", async (_event, ...rawArgs): Promise<LoopShape[]> => {
    const [environmentId] = validateIpc<[string]>("loopShapeCache:refresh", rawArgs);
    return refreshLoopShapesForEnvironment(environmentId);
  });

  // ── Sibling decline store ──────────────────────────────────────────
  safeHandle("siblingDecline:isDeclined", (_event, ...rawArgs): boolean => {
    const [environmentId, loopId, fingerprint] = validateIpc<[string, string, string]>("siblingDecline:isDeclined", rawArgs);
    return isSiblingDeclined(environmentId, loopId, fingerprint);
  });

  safeHandle("siblingDecline:recordDecline", (_event, ...rawArgs): void => {
    const [record] = validateIpc<[{ environmentId: string; loopId: string; fingerprint: string }]>("siblingDecline:recordDecline", rawArgs);
    recordSiblingDecline(record.environmentId, record.loopId, record.fingerprint);
  });

  // ── Global settings ──
  safeHandle("settings:get", (): GlobalSettings => {
    return getGlobalSettings();
  });

  safeHandle("settings:update", async (_event, ...rawArgs): Promise<void> => {
    const [updates] = validateIpc<[Partial<GlobalSettings>]>("settings:update", rawArgs);
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
  for (const controller of streams.values()) controller.abort();
  streams.clear();
  streamEnvironments.clear();
  for (const supervisor of supervisors.values()) supervisor.destroy();
  supervisors.clear();
  for (const tracker of endpointTrackers.values()) tracker.destroy();
  endpointTrackers.clear();
  destroyAllOpenCodeStatus();
  closeAllRegistryTunnels();
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
  closeAllRegistryTunnels();
});

process.on("exit", () => {
  forceKillAllRegistryTunnels();
});

const LOG_LEVELS = new Set<LogEntry["level"]>(["debug", "info", "warn", "error"]);
const SENSITIVE_LOG_CONTEXT_KEY = /password|secret|token|credential|authorization|cookie/i;

function isLogEntry(value: unknown): value is LogEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return LOG_LEVELS.has(entry.level as LogEntry["level"])
    && typeof entry.message === "string"
    && (entry.module === undefined || typeof entry.module === "string")
    && (entry.context === undefined || (typeof entry.context === "object" && entry.context !== null && !Array.isArray(entry.context)));
}

function formatLogContext(context: Record<string, unknown> | undefined): string {
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
