import { app, BrowserWindow, ipcMain, shell, dialog } from "electron";
import path from "node:path";
import fs from "node:fs";
import { execFile } from "node:child_process";
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
  CreateIssueParams,
  CreateIssueResult,
  ListIssuesParams,
  ListIssuesResult,
  IssueCard,
  PlatformType,
  PlatformDetectionResult,
  BudgetWatch,
  BudgetBreach,
  InboxItem,
  InboxQueryResult,
  AddLabelParams,
  AddLabelResult,
  EditIssueParams,
  EditIssueResult,
  OutageEscalation,
} from "../shared/ipc.js";
import type { Environment, SessionScope, NotificationSendArgs } from "../shared/ipc.js";
import { trimTrailingSlash } from "../shared/utils.js";
import { fetchAndUnwrap } from "./http-utils.js";
import { classifyPlatform, parseGitRemoteOutput } from "./platform-classifier.js";
import {
  getEnvironments,
  addEnvironment,
  removeEnvironment,
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
  getProjectPickupLabels,
  setProjectPickupLabels,
} from "./config-store.js";
import {
  ConnectionSupervisor,
  EndpointHealthTracker,
  makeProbe,
  resolveActiveUrl,
  fetchFingerprint,
} from "./connection-supervisor.js";
import { fetchPeers } from "./tailscale.js";
import { getOpenCodeStatus, refreshOpenCodeStatus, clearOpenCodeStatus } from "./opencode-client.js";
import { listSshHosts as vmListSshHosts, runWizard, cancelWizard, respondConsent, respondServiceSelection } from "./vm-wizard.js";
import { msg } from "./i18n.js";
import { validateIpc, safeHandle, IpcValidationError } from "./ipc-validation.js";
import { setMainWindow, getMainWindow } from "./main-window.js";
import { NotificationService } from "./notification-service.js";
import { OutageTracker } from "./outage-tracker.js";

const streams = new Map<string, AbortController>();

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

/** Cache: `${environmentId}:${projectId}` → detected platform. In-memory, session-scoped. */
const platformCache = new Map<string, PlatformType>();

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
    tracker = new EndpointHealthTracker(environmentId, (health) => {
      const win = getMainWindow();
      if (win) {
        win.webContents.send("connection:endpointHealth", environmentId, health);
      }
    });
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

interface CliCheckResult {
  cli: "gh" | "az";
  authenticated: boolean;
  error?: string;
}

function checkPlatformCli(): Promise<CliCheckResult | null> {
  return new Promise((resolve) => {
    execFile("gh", ["auth", "status"], (err, _stdout, stderr) => {
      if (!err) {
        resolve({ cli: "gh", authenticated: true });
        return;
      }
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        // gh not found, try az
        execFile("az", ["account", "show"], (azErr) => {
          if (!azErr) {
            resolve({ cli: "az", authenticated: true });
            return;
          }
          const azCode = (azErr as NodeJS.ErrnoException).code;
          if (azCode === "ENOENT") {
            resolve(null);
            return;
          }
          resolve({ cli: "az", authenticated: false, error: stderr || azErr.message });
        });
        return;
      }
      // gh found but not authenticated
      resolve({ cli: "gh", authenticated: false, error: stderr || err.message });
    });
  });
}

function platformCacheKey(environmentId: string, projectId: string): string {
  return `${environmentId}:${projectId}`;
}

function detectPlatform(directory: string): Promise<PlatformType> {
  return new Promise((resolve) => {
    execFile("git", ["remote", "-v"], { cwd: directory, timeout: 10_000 }, (err, stdout) => {
      if (err) {
        resolve("unknown");
        return;
      }
      const urls = parseGitRemoteOutput(stdout);
      resolve(classifyPlatform(urls));
    });
  });
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

  return fetchAndUnwrap(joinUrl(args.baseUrl, args.path), {
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

  const send = (kind: "data" | "event" | "end" | "error", text: string): void => {
    if (!sender.isDestroyed()) {
      sender.send("stream:event", { subId: args.subId, kind, text });
    }
  };

  const token = getSessionToken(envId);

  const streamHeaders: Record<string, string> = { Accept: "text/event-stream" };
  if (token) streamHeaders["Authorization"] = `Bearer ${token.accessToken}`;

  try {
    const res = await fetch(joinUrl(args.baseUrl, args.path), {
      signal: controller.signal,
      headers: streamHeaders,
    });
    if (!res.ok || !res.body) {
      send("error", `HTTP ${res.status}`);
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk as Uint8Array, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of block.split("\n")) {
          if (line.startsWith("data: ")) {
            send("data", line.slice(6));
          } else if (line.startsWith("event: ")) {
            send("event", line.slice(7));
          }
        }
      }
    }
    send("end", "");
  } catch (err) {
    if (!(err instanceof Error && err.name === "AbortError")) {
      send("error", err instanceof Error ? err.message : String(err));
    }
  } finally {
    streams.delete(args.subId);
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
    console.warn("[bounds] Invalid bounds file content, using defaults");
  } catch (err) {
    // first launch or corrupt file, use defaults
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("[bounds] Failed to load bounds file, using defaults:", err);
    }
  }
  return { width: 1440, height: 900 };
}

function saveBounds(win: BrowserWindow): void {
  try {
    const bounds: WindowBounds = { ...win.getNormalBounds(), maximized: win.isMaximized() };
    fs.writeFileSync(boundsFile(), JSON.stringify(bounds));
  } catch (err) {
    console.warn("[bounds] Failed to save window bounds:", err);
  }
}

function seedSupervisors(): void {
  for (const env of getEnvironments()) {
    const url = resolveActiveUrl(env.endpoints, env.activeEndpointId);
    if (url) {
      getOrCreateSupervisor(env.id, url);
    }
    syncEndpointTracker(env.id);
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
      preload: path.join(import.meta.dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => {
    if (saved.maximized) win.maximize();
    win.show();
    seedSupervisors();
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
        const activeUrl = resolveActiveUrl(existing.endpoints, ep?.id ?? existing.activeEndpointId);
        if (activeUrl) getOrCreateSupervisor(existing.id, activeUrl);
        return existing;
      }
    }
    const env = await addEnvironment(name, url, endpointKind);
    if (fingerprint) {
      await setEnvironmentFingerprintId(env.id, fingerprint.id);
    }
    await autoPromoteFirstEnvIfNeeded();
    const activeUrl = resolveActiveUrl(env.endpoints, env.activeEndpointId);
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
    await removeEnvironment(id);
  });
  safeHandle("config:addEndpoint", async (_event, ...rawArgs) => {
    const [environmentId, url, kind] = validateIpc<[string, string, string]>("config:addEndpoint", rawArgs);
    const ep = await addEndpoint(environmentId, url, kind as "direct" | "ssh" | "tailscale");
    syncEndpointTracker(environmentId);
    return ep;
  });
  safeHandle("config:removeEndpoint", async (_event, ...rawArgs) => {
    const [environmentId, endpointId] = validateIpc<[string, string]>("config:removeEndpoint", rawArgs);
    await removeEndpoint(environmentId, endpointId);
    syncEndpointTracker(environmentId);
  });
  safeHandle("config:setActiveEndpoint", async (_event, ...rawArgs) => {
    const [environmentId, endpointId] = validateIpc<[string, string]>("config:setActiveEndpoint", rawArgs);
    await setActiveEndpoint(environmentId, endpointId);
    const envs = getEnvironments();
    const env = envs.find((e: Environment) => e.id === environmentId);
    if (env) {
      const url = resolveActiveUrl(env.endpoints, endpointId);
      if (url) {
        removeSupervisor(environmentId);
        getOrCreateSupervisor(environmentId, url);
      }
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
        console.error(`[IPC] ${err.message}`);
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
    const [target, name] = validateIpc<[string, string | undefined]>("vmWizard:start", rawArgs);
    return runWizard(target, name);
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

  safeHandle("infra:executeAction", async (_event, ...rawArgs): Promise<InfraActionResult> => {
    const [args] = validateIpc<[InfraActionArgs]>("infra:executeAction", rawArgs);
    const mainVmEnv = getMainVm();
    if (!mainVmEnv) {
      return { ok: false, error: msg("vmWizard.mainNoMainVm") };
    }
    const url = resolveActiveUrl(mainVmEnv.endpoints, mainVmEnv.activeEndpointId);
    if (!url) {
      return { ok: false, error: msg("vmWizard.mainNoEndpoint") };
    }

    switch (args.action) {
      case "machine-status": {
        const envs = getEnvironments();
        const results: Array<{ id: string; name: string; health: string; endpoints: Array<{ url: string; kind: string }> }> = [];
        for (const env of envs) {
          const supervisor = supervisors.get(env.id);
          const phase = supervisor ? supervisor.getStatus().phase : "offline";
          results.push({
            id: env.id,
            name: env.name,
            health: phase,
            endpoints: env.endpoints.map((ep) => ({ url: ep.url, kind: ep.kind })),
          });
        }
        return { ok: true, data: results };
      }
      case "clone-repo": {
        const repoUrl = args.params?.repoUrl as string | undefined;
        const targetVmId = args.params?.targetVmId as string | undefined;
        if (!repoUrl) {
          return { ok: false, error: msg("vmWizard.mainRepoUrlRequired") };
        }
        const targetEnv = targetVmId
          ? getEnvironments().find((e: Environment) => e.id === targetVmId)
          : mainVmEnv;
        if (!targetEnv) {
          return { ok: false, error: msg("vmWizard.mainTargetVmNotFound") };
        }
        const targetUrl = resolveActiveUrl(targetEnv.endpoints, targetEnv.activeEndpointId);
        if (!targetUrl) {
          return { ok: false, error: msg("vmWizard.mainTargetVmNoEndpoint") };
        }
        const cloneResult = await handleApiRequest({
          baseUrl: targetUrl,
          path: "/api/repos/clone",
          method: "POST",
          body: { url: repoUrl },
        });
        if (!cloneResult.ok) {
          return { ok: false, error: cloneResult.error ?? msg("vmWizard.mainCloneFailed") };
        }
        return { ok: true, data: { vm: targetEnv.name, repoUrl, result: cloneResult.data } };
      }
      case "detect-platform": {
        const envId = args.params?.environmentId as string | undefined;
        const projectId = (args.params?.projectId as string | undefined) ?? "";
        const directory = args.params?.directory as string | undefined;
        const force = (args.params?.force as boolean | undefined) ?? false;

        if (!envId) {
          return { ok: false, error: msg("platformDetect.envIdRequired") };
        }

        const key = platformCacheKey(envId, projectId);
        if (!force && platformCache.has(key)) {
          const cached: PlatformDetectionResult = {
            platform: platformCache.get(key)!,
            remotes: [],
            cached: true,
          };
          return { ok: true, data: cached };
        }

        if (!directory) {
          // No directory provided — cannot run git, report unknown
          platformCache.set(key, "unknown");
          const result: PlatformDetectionResult = {
            platform: "unknown",
            remotes: [],
            cached: false,
          };
          return { ok: true, data: result };
        }

        const platform = await detectPlatform(directory);
        platformCache.set(key, platform);

        // Re-run git to capture the URLs for reporting
        let remotes: string[] = [];
        try {
          remotes = await new Promise<string[]>((resolve) => {
            execFile("git", ["remote", "-v"], { cwd: directory, timeout: 10_000 }, (err, stdout) => {
              if (err) { resolve([]); return; }
              resolve(parseGitRemoteOutput(stdout));
            });
          });
        } catch {
          // best effort
        }

        const result: PlatformDetectionResult = {
          platform,
          remotes,
          cached: false,
        };
        return { ok: true, data: result };
      }
      case "create-issue": {
        const params = args.params as CreateIssueParams | undefined;
        if (!params?.title) {
          return { ok: false, error: msg("issues.titleRequired") };
        }

        // Prefer cached platform when available
        const cachedPlatform = args.params?.projectId
          ? platformCache.get(platformCacheKey(mainVmEnv.id, args.params.projectId as string))
          : undefined;

        let preferredCli: "gh" | "az" | null = null;
        if (cachedPlatform === "github") {
          preferredCli = "gh";
        } else if (cachedPlatform === "ado") {
          preferredCli = "az";
        }

        const cliCheck = await checkPlatformCli();
        if (!cliCheck && !preferredCli) {
          return { ok: false, error: msg("issues.noPlatformCli") };
        }

        // Determine which CLI to use: prefer cached platform, fall back to heuristic
        let useCli: "gh" | "az";

        if (preferredCli) {
          // Use the preferred CLI if it's available and authenticated
          if (preferredCli === "gh" && cliCheck?.cli === "gh" && cliCheck.authenticated) {
            useCli = "gh";
          } else if (preferredCli === "az" && cliCheck?.cli === "az" && cliCheck.authenticated) {
            useCli = "az";
          } else if (cliCheck && cliCheck.authenticated) {
            // Preferred CLI not available/authenticated, fall back to whatever works
            useCli = cliCheck.cli;
          } else {
            // No authenticated CLI at all
            if (!cliCheck) {
              return { ok: false, error: msg("issues.noPlatformCli") };
            }
            if (cliCheck.cli === "gh") {
              return { ok: false, error: msg("issues.ghNotAuth") };
            }
            return { ok: false, error: msg("issues.azNotAuth") };
          }
        } else {
          // No cached platform — use existing heuristic
          if (!cliCheck) {
            return { ok: false, error: msg("issues.noPlatformCli") };
          }
          if (!cliCheck.authenticated) {
            if (cliCheck.cli === "gh") {
              return { ok: false, error: msg("issues.ghNotAuth") };
            }
            return { ok: false, error: msg("issues.azNotAuth") };
          }
          useCli = cliCheck.cli;
        }

        const title = params.title;
        const body = params.body ?? "";
        const labels = params.labels ?? [];
        const repo = params.repo;

        if (useCli === "gh") {
          const ghArgs: string[] = ["issue", "create", "--title", title, "--body", body];
          for (const label of labels) {
            ghArgs.push("--label", label);
          }
          if (repo) {
            ghArgs.push("--repo", repo);
          }
          return new Promise<InfraActionResult>((resolve) => {
            execFile("gh", ghArgs, (err, stdout, stderr) => {
              if (err) {
                resolve({ ok: false, error: msg("issues.createFailed", { detail: stderr || err.message }) });
                return;
              }
              const url = stdout.trim();
              const numberMatch = url.match(/\/issues\/(\d+)$/);
              const result: CreateIssueResult = {
                platform: "github",
                url,
                number: numberMatch ? parseInt(numberMatch[1], 10) : undefined,
              };
              resolve({ ok: true, data: result });
            });
          });
        }

        // az boards work-item create
        const azArgs: string[] = [
          "boards", "work-item", "create",
          "--title", title,
          "--description", body,
          "--type", "Issue",
        ];
        return new Promise<InfraActionResult>((resolve) => {
          execFile("az", azArgs, (err, stdout, stderr) => {
            if (err) {
              resolve({ ok: false, error: msg("issues.createFailed", { detail: stderr || err.message }) });
              return;
            }
            try {
              const parsed = JSON.parse(stdout) as { id?: number; url?: string };
              const result: CreateIssueResult = {
                platform: "ado",
                url: parsed.url ?? "",
                number: parsed.id,
              };
              resolve({ ok: true, data: result });
            } catch {
              resolve({ ok: false, error: msg("issues.createFailed", { detail: "Unexpected output from az CLI" }) });
            }
          });
        });
      }
      case "list-issues": {
        return handleListIssues(args);
      }
      case "add-label": {
        const params = args.params as AddLabelParams | undefined;
        if (!params?.issueNumber || !params.labels?.length) {
          return { ok: false, error: msg("labels.issueNumberAndLabelsRequired") };
        }

        const cliCheck = await checkPlatformCli();
        if (!cliCheck || cliCheck.cli !== "gh" || !cliCheck.authenticated) {
          return { ok: false, error: msg("labels.ghRequiredForLabels") };
        }

        const labelArgs: string[] = [
          "issue", "edit", String(params.issueNumber),
          "--add-label", params.labels.join(","),
        ];
        if (params.repo) {
          labelArgs.push("--repo", params.repo);
        }

        return new Promise<InfraActionResult>((resolve) => {
          execFile("gh", labelArgs, (err, _stdout, stderr) => {
            if (err) {
              resolve({ ok: false, error: msg("labels.addFailed", { detail: stderr || err.message }) });
              return;
            }
            const result: AddLabelResult = {
              issueNumber: params.issueNumber,
              labels: params.labels,
            };
            resolve({ ok: true, data: result });
          });
        });
      }
      case "edit-issue": {
        const params = args.params as EditIssueParams | undefined;
        if (!params?.issueNumber) {
          return { ok: false, error: msg("editIssue.issueNumberRequired") };
        }
        if (!params.title && !params.body && !params.addLabels?.length && !params.removeLabels?.length) {
          return { ok: false, error: msg("editIssue.noChanges") };
        }

        const cachedPlatform = args.params?.projectId
          ? platformCache.get(platformCacheKey(mainVmEnv.id, args.params.projectId as string))
          : undefined;

        let preferredCli: "gh" | "az" | null = null;
        if (cachedPlatform === "github") {
          preferredCli = "gh";
        } else if (cachedPlatform === "ado") {
          preferredCli = "az";
        }

        const cliCheck = await checkPlatformCli();
        if (!cliCheck && !preferredCli) {
          return { ok: false, error: msg("editIssue.noPlatformCli") };
        }

        let useCli: "gh" | "az";
        if (preferredCli) {
          if (preferredCli === "gh" && cliCheck?.cli === "gh" && cliCheck.authenticated) {
            useCli = "gh";
          } else if (preferredCli === "az" && cliCheck?.cli === "az" && cliCheck.authenticated) {
            useCli = "az";
          } else if (cliCheck && cliCheck.authenticated) {
            useCli = cliCheck.cli;
          } else {
            if (!cliCheck) {
              return { ok: false, error: msg("editIssue.noPlatformCli") };
            }
            if (cliCheck.cli === "gh") {
              return { ok: false, error: msg("editIssue.ghNotAuth") };
            }
            return { ok: false, error: msg("editIssue.azNotAuth") };
          }
        } else {
          if (!cliCheck) {
            return { ok: false, error: msg("editIssue.noPlatformCli") };
          }
          if (!cliCheck.authenticated) {
            if (cliCheck.cli === "gh") {
              return { ok: false, error: msg("editIssue.ghNotAuth") };
            }
            return { ok: false, error: msg("editIssue.azNotAuth") };
          }
          useCli = cliCheck.cli;
        }

        // Azure DevOps: label operations are not supported via az boards CLI
        if (useCli === "az" && (params.addLabels?.length || params.removeLabels?.length)) {
          return { ok: false, error: msg("editIssue.adoLabelsNotSupported") };
        }

        if (useCli === "gh") {
          const ghArgs: string[] = ["issue", "edit", String(params.issueNumber)];
          if (params.title) {
            ghArgs.push("--title", params.title);
          }
          if (params.body) {
            ghArgs.push("--body", params.body);
          }
          if (params.addLabels?.length) {
            ghArgs.push("--add-label", params.addLabels.join(","));
          }
          if (params.removeLabels?.length) {
            ghArgs.push("--remove-label", params.removeLabels.join(","));
          }
          if (params.repo) {
            ghArgs.push("--repo", params.repo);
          }

          const changes: EditIssueResult["changes"] = {};
          if (params.title) changes.title = true;
          if (params.body) changes.body = true;
          if (params.addLabels?.length) changes.labelsAdded = params.addLabels;
          if (params.removeLabels?.length) changes.labelsRemoved = params.removeLabels;

          return new Promise<InfraActionResult>((resolve) => {
            execFile("gh", ghArgs, (err, _stdout, stderr) => {
              if (err) {
                resolve({ ok: false, error: msg("editIssue.editFailed", { detail: stderr || err.message }) });
                return;
              }
              const result: EditIssueResult = {
                platform: "github",
                issueNumber: params.issueNumber,
                changes,
              };
              resolve({ ok: true, data: result });
            });
          });
        }

        // az boards work-item update
        const azArgs: string[] = [
          "boards", "work-item", "update",
          "--id", String(params.issueNumber),
        ];
        if (params.title) {
          azArgs.push("--title", params.title);
        }
        if (params.body) {
          azArgs.push("--description", params.body);
        }

        const changes: EditIssueResult["changes"] = {};
        if (params.title) changes.title = true;
        if (params.body) changes.body = true;

        return new Promise<InfraActionResult>((resolve) => {
          execFile("az", azArgs, (err, stdout, stderr) => {
            if (err) {
              resolve({ ok: false, error: msg("editIssue.editFailed", { detail: stderr || err.message }) });
              return;
            }
            try {
              const parsed = JSON.parse(stdout) as { id?: number };
              const result: EditIssueResult = {
                platform: "ado",
                issueNumber: parsed.id ?? params.issueNumber,
                changes,
              };
              resolve({ ok: true, data: result });
            } catch {
              resolve({ ok: false, error: msg("editIssue.editFailed", { detail: "Unexpected output from az CLI" }) });
            }
          });
        });
      }
      default:
        return { ok: false, error: msg("vmWizard.mainUnknownAction", { action: args.action }) };
    }
  });

  // gh issue list JSON field names
  interface GhIssueJson {
    number: number;
    title: string;
    url: string;
    labels: Array<{ name: string }>;
    state: string;
    createdAt: string;
    updatedAt: string;
  }

  function handleListIssues(args: InfraActionArgs): Promise<InfraActionResult> {
    const params = args.params as ListIssuesParams | undefined;
    const labels = params?.labels;
    const state = params?.state ?? "open";
    const repo = params?.repo;
    const limit = Math.min(params?.limit ?? 20, 100);

    return new Promise<InfraActionResult>((resolve) => {
      execFile("gh", ["issue", "list", "--json", "number,title,url,labels,state,createdAt,updatedAt", "--limit", String(limit), "--state", state, ...(labels ? ["--label", labels] : []), ...(repo ? ["--repo", repo] : [])], (err, stdout, stderr) => {
        if (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === "ENOENT") {
            resolve({ ok: false, error: msg("issues.noPlatformCli") });
            return;
          }
          resolve({ ok: false, error: msg("issues.listFailed", { detail: stderr || err.message }) });
          return;
        }

        let parsed: GhIssueJson[];
        try {
          parsed = JSON.parse(stdout) as GhIssueJson[];
        } catch {
          resolve({ ok: false, error: msg("issues.listFailed", { detail: "Invalid output from gh CLI" }) });
          return;
        }

        const issues: IssueCard[] = parsed.map((item) => ({
          number: item.number,
          title: item.title,
          url: item.url,
          labels: item.labels.map((l) => l.name),
          state: (item.state === "closed" ? "closed" : "open") as "open" | "closed",
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        }));

        const result: ListIssuesResult = {
          platform: "github",
          issues,
          total: issues.length,
          truncated: issues.length >= limit,
        };

        resolve({ ok: true, data: result });
      });
    });
  }

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

  // Prune old breaches on startup
  void pruneOldBreaches();

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
  for (const supervisor of supervisors.values()) supervisor.destroy();
  supervisors.clear();
  for (const tracker of endpointTrackers.values()) tracker.destroy();
  endpointTrackers.clear();
  if (process.platform !== "darwin") app.quit();
});
