import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
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
} from "../shared/ipc.js";
import type { Environment, SessionScope } from "../shared/ipc.js";
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
  getMainVmId,
  getMainVm,
  setMainVm,
  autoPromoteFirstEnvIfNeeded,
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
import { validateIpc } from "./ipc-validation.js";

const DEFAULT_TIMEOUT_MS = 10_000;

const streams = new Map<string, AbortController>();

const supervisors = new Map<string, ConnectionSupervisor>();
const endpointTrackers = new Map<string, EndpointHealthTracker>();

function getOrCreateSupervisor(environmentId: string, baseUrl: string): ConnectionSupervisor {
  let existing = supervisors.get(environmentId);
  if (existing) return existing;

    const supervisor = new ConnectionSupervisor(
    makeProbe(baseUrl, environmentId),
    (status: ConnectionStatus) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send("connection:status", environmentId, status);
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
    tracker = new EndpointHealthTracker(environmentId, (health) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
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

function isAllowedBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function joinUrl(baseUrl: string, apiPath: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${apiPath.startsWith("/") ? "" : "/"}${apiPath}`;
}

function findEnvironmentIdByUrl(baseUrl: string): string | null {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  const envs = getEnvironments();
  for (const env of envs) {
    for (const ep of env.endpoints) {
      if (ep.url.trim().replace(/\/+$/, "") === normalized) return env.id;
    }
  }
  return null;
}

async function handleApiRequest(args: ApiRequestArgs): Promise<ApiResponse> {
  if (!isAllowedBaseUrl(args.baseUrl)) {
    return { ok: false, status: 0, error: msg("vmWizard.mainInvalidEnvUrl", { url: args.baseUrl }) };
  }
  if (!args.path.startsWith("/") || args.path.includes("..")) {
    return { ok: false, status: 0, error: "Invalid API path" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const envId = findEnvironmentIdByUrl(args.baseUrl);
  const token = envId ? getSessionToken(envId) : null;

  try {
    const headers: Record<string, string> = {};
    if (args.body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers["Authorization"] = `Bearer ${token.accessToken}`;

    const res = await fetch(joinUrl(args.baseUrl, args.path), {
      method: args.method ?? "GET",
      headers,
      body: args.body !== undefined ? JSON.stringify(args.body) : undefined,
      signal: controller.signal,
    });

    if (res.status === 401 && envId) {
      removeSessionToken(envId);
      setEnvironmentAuthState(envId, "blocked");
    }

    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // keep raw text for non-JSON responses
    }

    if (parsed && typeof parsed === "object" && "ok" in parsed) {
      const envelope = parsed as { ok: boolean; data?: unknown; error?: { message?: string } };
      if (envelope.ok) {
        return { ok: true, status: res.status, data: envelope.data };
      }
      return { ok: false, status: res.status, error: envelope.error?.message ?? msg("vmWizard.mainHttpError", { status: res.status }) };
    }

    if (!res.ok) {
      return { ok: false, status: res.status, error: msg("vmWizard.mainHttpError", { status: res.status }) };
    }
    return { ok: true, status: res.status, data: parsed };
  } catch (err) {
    const message = err instanceof Error && err.name === "AbortError"
      ? msg("vmWizard.mainRequestTimedOut")
      : err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

async function handleStreamSubscribe(
  sender: Electron.WebContents,
  args: StreamSubscribeArgs,
): Promise<void> {
  if (!isAllowedBaseUrl(args.baseUrl)) return;
  if (streams.has(args.subId)) return;

  const controller = new AbortController();
  streams.set(args.subId, controller);

  const send = (kind: "data" | "event" | "end" | "error", text: string): void => {
    if (!sender.isDestroyed()) {
      sender.send("stream:event", { subId: args.subId, kind, text });
    }
  };

  const envId = findEnvironmentIdByUrl(args.baseUrl);
  const token = envId ? getSessionToken(envId) : null;

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
  } catch {
    // first launch or corrupt file, use defaults
  }
  return { width: 1440, height: 900 };
}

function saveBounds(win: BrowserWindow): void {
  try {
    const bounds: WindowBounds = { ...win.getNormalBounds(), maximized: win.isMaximized() };
    fs.writeFileSync(boundsFile(), JSON.stringify(bounds));
  } catch {
    // non-fatal
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
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on("second-instance", () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.setName("Orbion");

app.whenReady().then(() => {
  ipcMain.handle("api:request", (_event, ...rawArgs) => {
    const [args] = validateIpc<[ApiRequestArgs]>("api:request", rawArgs);
    return handleApiRequest(args);
  });

  ipcMain.handle("stream:subscribe", (event, ...rawArgs) => {
    const [args] = validateIpc<[StreamSubscribeArgs]>("stream:subscribe", rawArgs);
    void handleStreamSubscribe(event.sender, args);
  });

  ipcMain.handle("stream:unsubscribe", (_event, ...rawArgs) => {
    const [subId] = validateIpc<[string]>("stream:unsubscribe", rawArgs);
    streams.get(subId)?.abort();
    streams.delete(subId);
  });

  ipcMain.handle("config:getEnvironments", () => {
    validateIpc("config:getEnvironments", []);
    return getEnvironments();
  });
  ipcMain.handle("config:addEnvironment", async (_event, ...rawArgs) => {
    const [name, url, kind] = validateIpc<[string, string, string | undefined]>("config:addEnvironment", rawArgs);
    const endpointKind = (kind as "direct" | "ssh" | "tailscale") ?? "direct";
    const fingerprint = await fetchFingerprint(url);
    if (fingerprint) {
      const existing = findEnvironmentByFingerprint(fingerprint.id);
      if (existing) {
        const ep = addEndpoint(existing.id, url, endpointKind);
        syncEndpointTracker(existing.id);
        const activeUrl = resolveActiveUrl(existing.endpoints, ep?.id ?? existing.activeEndpointId);
        if (activeUrl) getOrCreateSupervisor(existing.id, activeUrl);
        return existing;
      }
    }
    const env = addEnvironment(name, url, endpointKind);
    if (fingerprint) {
      setEnvironmentFingerprintId(env.id, fingerprint.id);
    }
    autoPromoteFirstEnvIfNeeded();
    const activeUrl = resolveActiveUrl(env.endpoints, env.activeEndpointId);
    if (activeUrl) getOrCreateSupervisor(env.id, activeUrl);
    syncEndpointTracker(env.id);
    return env;
  });
  ipcMain.handle("config:exchangePairingCode", async (_event, ...rawArgs) => {
    const [baseUrl, code, scope] = validateIpc<[string, string, string | undefined]>("config:exchangePairingCode", rawArgs);
    const sessionScope = (scope as SessionScope) ?? "read-only";
    const result = await exchangePairingCode(baseUrl, code, sessionScope);
    if (result.ok && result.token) {
      const envId = findEnvironmentIdByUrl(baseUrl);
      if (envId) {
        storeSessionToken(envId, result.token);
      }
    }
    return result;
  });
  ipcMain.handle("config:removeSessionToken", (_event, ...rawArgs) => {
    const [environmentId] = validateIpc<[string]>("config:removeSessionToken", rawArgs);
    removeSessionToken(environmentId);
  });
  ipcMain.handle("config:removeEnvironment", (_event, ...rawArgs) => {
    const [id] = validateIpc<[string]>("config:removeEnvironment", rawArgs);
    removeSupervisor(id);
    removeEnvironment(id);
  });
  ipcMain.handle("config:addEndpoint", (_event, ...rawArgs) => {
    const [environmentId, url, kind] = validateIpc<[string, string, string]>("config:addEndpoint", rawArgs);
    const ep = addEndpoint(environmentId, url, kind as "direct" | "ssh" | "tailscale");
    syncEndpointTracker(environmentId);
    return ep;
  });
  ipcMain.handle("config:removeEndpoint", (_event, ...rawArgs) => {
    const [environmentId, endpointId] = validateIpc<[string, string]>("config:removeEndpoint", rawArgs);
    removeEndpoint(environmentId, endpointId);
    syncEndpointTracker(environmentId);
  });
  ipcMain.handle("config:setActiveEndpoint", (_event, ...rawArgs) => {
    const [environmentId, endpointId] = validateIpc<[string, string]>("config:setActiveEndpoint", rawArgs);
    setActiveEndpoint(environmentId, endpointId);
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
  ipcMain.handle("config:getSelectedEnvironmentId", () => {
    validateIpc("config:getSelectedEnvironmentId", []);
    return getSelectedEnvironmentId();
  });
  ipcMain.handle("config:setSelectedEnvironmentId", (_event, ...rawArgs) => {
    const [id] = validateIpc<[string | null]>("config:setSelectedEnvironmentId", rawArgs);
    return setSelectedEnvironmentId(id);
  });
  ipcMain.handle(
    "config:migrateFromLocalStorage",
    (_event, ...rawArgs) => {
      const [rawInstances, rawSelectedId] = validateIpc<[string, string | null]>("config:migrateFromLocalStorage", rawArgs);
      return migrateFromLocalStorage(rawInstances, rawSelectedId);
    },
  );

  ipcMain.handle("connection:getStatus", (_event, ...rawArgs) => {
    const [environmentId] = validateIpc<[string]>("connection:getStatus", rawArgs);
    const supervisor = supervisors.get(environmentId);
    return supervisor ? supervisor.getStatus() : null;
  });

  ipcMain.handle("connection:getEndpointHealth", (_event, ...rawArgs): EndpointHealth[] => {
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

  ipcMain.handle("connection:retry", (_event, ...rawArgs) => {
    const [environmentId] = validateIpc<[string]>("connection:retry", rawArgs);
    const supervisor = supervisors.get(environmentId);
    if (supervisor) supervisor.wakeup();
  });

  ipcMain.on("connection:networkChanged", (_event, ...rawArgs) => {
    const [online] = validateIpc<[boolean]>("connection:networkChanged", rawArgs);
    setOsOffline(!online);
  });

  ipcMain.handle("tailscale:peers", () => {
    validateIpc("tailscale:peers", []);
    return fetchPeers();
  });

  ipcMain.handle("vmWizard:listSshHosts", () => {
    validateIpc("vmWizard:listSshHosts", []);
    return vmListSshHosts();
  });

  ipcMain.handle("vmWizard:start", async (_event, ...rawArgs) => {
    const [target, name] = validateIpc<[string, string | undefined]>("vmWizard:start", rawArgs);
    return runWizard(target, name);
  });

  ipcMain.handle("vmWizard:cancel", () => {
    validateIpc("vmWizard:cancel", []);
    cancelWizard();
  });

  ipcMain.handle("vmWizard:respondConsent", (_event, ...rawArgs) => {
    const [decision] = validateIpc<["install" | "skip"]>("vmWizard:respondConsent", rawArgs);
    respondConsent(decision);
  });

  ipcMain.handle("vmWizard:respondServiceSelection", (_event, ...rawArgs) => {
    const [selection] = validateIpc<[import("../shared/ipc.js").VmWizardServiceSelection]>("vmWizard:respondServiceSelection", rawArgs);
    respondServiceSelection(selection);
  });

  ipcMain.handle("opencode:getStatus", (_event, ...rawArgs): OpenCodeConnectionStatus => {
    const [environmentId] = validateIpc<[string]>("opencode:getStatus", rawArgs);
    return getOpenCodeStatus(environmentId);
  });

  ipcMain.handle("opencode:refreshStatus", async (_event, ...rawArgs): Promise<OpenCodeConnectionStatus> => {
    const [environmentId] = validateIpc<[string]>("opencode:refreshStatus", rawArgs);
    const envs = getEnvironments();
    const env = envs.find((e: Environment) => e.id === environmentId);
    if (!env?.opencode) {
      return getOpenCodeStatus(environmentId);
    }
    return refreshOpenCodeStatus(environmentId, env.opencode);
  });

  ipcMain.handle("config:setOpenCodeEndpoint", async (_event, ...rawArgs) => {
    const [environmentId, endpoint] = validateIpc<[string, OpenCodeEndpoint | null]>("config:setOpenCodeEndpoint", rawArgs);
    setOpenCodeEndpoint(environmentId, endpoint);
    if (endpoint) {
      await refreshOpenCodeStatus(environmentId, endpoint);
    } else {
      clearOpenCodeStatus(environmentId);
    }
  });

  ipcMain.handle("config:setMainVm", (_event, ...rawArgs) => {
    const [environmentId] = validateIpc<[string]>("config:setMainVm", rawArgs);
    setMainVm(environmentId);
  });

  ipcMain.handle("config:getMainVmId", () => {
    validateIpc("config:getMainVmId", []);
    return getMainVmId();
  });

  ipcMain.handle("infra:executeAction", async (_event, ...rawArgs): Promise<InfraActionResult> => {
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
      default:
        return { ok: false, error: msg("vmWizard.mainUnknownAction", { action: args.action }) };
    }
  });

  ipcMain.handle("infra:getStatus", () => {
    validateIpc("infra:getStatus", []);
    const mainVmId = getMainVmId();
    const connected = mainVmId !== null && supervisors.has(mainVmId)
      && supervisors.get(mainVmId)!.getStatus().phase === "connected";
    return { mainVmId, connected };
  });

  autoPromoteFirstEnvIfNeeded();
  createWindow();

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
