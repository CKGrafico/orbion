import Store from "electron-store";
import { safeStorage } from "electron";
import type { AccessEndpoint, EndpointKind, Environment, EnvironmentRole, SessionScope, SessionToken, PairingCodeExchangeResponse, EnvironmentAuthState, OpenCodeEndpoint, I18nMessage } from "../shared/ipc.js";
import { msg } from "./i18n.js";

interface LegacyInstance {
  id: string;
  name: string;
  baseUrl: string;
}

interface EnvironmentWithFingerprint extends Environment {
  fingerprintId?: string;
  authState?: EnvironmentAuthState;
  opencode?: OpenCodeEndpoint | null;
  infraOpenCode?: OpenCodeEndpoint | null;
  role?: EnvironmentRole;
}

interface EncryptedSessionToken {
  encryptedAccessToken: string;
  scope: SessionScope;
  expiresAt: number | null;
}

interface ConfigSchema {
  environments: EnvironmentWithFingerprint[];
  selectedEnvironmentId: string | null;
  instances: LegacyInstance[];
  selectedInstanceId: string | null;
  instancesMigrated: boolean;
  sessionTokens: Record<string, EncryptedSessionToken>;
  [key: string]: unknown;
}

const store = new Store<ConfigSchema>({
  defaults: {
    environments: [],
    selectedEnvironmentId: null,
    instances: [],
    selectedInstanceId: null,
    instancesMigrated: false,
    sessionTokens: {},
  },
});

function ensureMigrated(): void {
  if (store.get("instancesMigrated", false)) return;

  const legacyInstances = store.get("instances", []);
  if (legacyInstances.length > 0 && store.get("environments", []).length === 0) {
    const environments: Environment[] = legacyInstances.map((inst: LegacyInstance) => {
      const endpoint: AccessEndpoint = {
        id: inst.id,
        kind: "direct",
        url: inst.baseUrl,
        lastError: null,
        failureCount: 0,
      };
      return {
        id: inst.id,
        name: inst.name,
        endpoints: [endpoint],
        activeEndpointId: inst.id,
      };
    });
    store.set("environments", environments);

    const legacySelected = store.get("selectedInstanceId", null);
    if (legacySelected) {
      store.set("selectedEnvironmentId", legacySelected);
    }
  }

  store.set("instancesMigrated", true);
}

export function getEnvironments(): EnvironmentWithFingerprint[] {
  ensureMigrated();
  return store.get("environments", []);
}

export function findEnvironmentByFingerprint(fingerprintId: string): EnvironmentWithFingerprint | undefined {
  ensureMigrated();
  const envs = store.get("environments", []);
  return envs.find((e) => e.fingerprintId === fingerprintId);
}

export function setEnvironmentFingerprintId(environmentId: string, fingerprintId: string): void {
  const envs = store.get("environments", []);
  const env = envs.find((e) => e.id === environmentId);
  if (!env) return;
  env.fingerprintId = fingerprintId;
  store.set("environments", envs);
}

export function addEnvironment(name: string, url: string, kind: EndpointKind = "direct"): Environment {
  ensureMigrated();
  const endpointId = crypto.randomUUID().slice(0, 8);
  const endpoint: AccessEndpoint = {
    id: endpointId,
    kind,
    url: url.trim().replace(/\/+$/, ""),
    lastError: null,
    failureCount: 0,
  };
  const env: Environment = {
    id: crypto.randomUUID().slice(0, 8),
    name: name.trim(),
    endpoints: [endpoint],
    activeEndpointId: endpointId,
  };
  const envs = getEnvironments();
  store.set("environments", [...envs, env]);
  return env;
}

export function removeEnvironment(id: string): void {
  const envs = getEnvironments().filter((e) => e.id !== id);
  store.set("environments", envs);
  const selectedId = store.get("selectedEnvironmentId");
  if (selectedId === id) {
    store.set("selectedEnvironmentId", null);
  }
}

export function addEndpoint(environmentId: string, url: string, kind: EndpointKind): AccessEndpoint | null {
  const envs = getEnvironments();
  const env = envs.find((e) => e.id === environmentId);
  if (!env) return null;

  const endpoint: AccessEndpoint = {
    id: crypto.randomUUID().slice(0, 8),
    kind,
    url: url.trim().replace(/\/+$/, ""),
    lastError: null,
    failureCount: 0,
  };
  env.endpoints = [...env.endpoints, endpoint];
  store.set("environments", envs);
  return endpoint;
}

export function removeEndpoint(environmentId: string, endpointId: string): void {
  const envs = getEnvironments();
  const env = envs.find((e) => e.id === environmentId);
  if (!env) return;

  env.endpoints = env.endpoints.filter((ep) => ep.id !== endpointId);
  if (env.activeEndpointId === endpointId) {
    env.activeEndpointId = env.endpoints.length > 0 ? env.endpoints[0].id : null;
  }
  store.set("environments", envs);
}

export function setActiveEndpoint(environmentId: string, endpointId: string): void {
  const envs = getEnvironments();
  const env = envs.find((e) => e.id === environmentId);
  if (!env) return;
  if (!env.endpoints.some((ep) => ep.id === endpointId)) return;
  env.activeEndpointId = endpointId;
  store.set("environments", envs);
}

export function getSelectedEnvironmentId(): string | null {
  ensureMigrated();
  return store.get("selectedEnvironmentId", null);
}

export function setSelectedEnvironmentId(id: string | null): void {
  store.set("selectedEnvironmentId", id);
}

export function migrateFromLocalStorage(rawInstances: string, rawSelectedId: string | null): boolean {
  try {
    const parsed = JSON.parse(rawInstances) as LegacyInstance[];
    if (!Array.isArray(parsed)) return false;

    const current = getEnvironments();
    if (current.length === 0) {
      const environments: Environment[] = parsed.map((inst) => {
        const endpoint: AccessEndpoint = {
          id: inst.id,
          kind: "direct",
          url: inst.baseUrl,
          lastError: null,
          failureCount: 0,
        };
        return {
          id: inst.id,
          name: inst.name,
          endpoints: [endpoint],
          activeEndpointId: inst.id,
        };
      });
      store.set("environments", environments);
    }
    if (rawSelectedId) {
      store.set("selectedEnvironmentId", rawSelectedId);
    }
    return true;
  } catch {
    return false;
  }
}

export function updateEndpointHealth(environmentId: string, endpointId: string, lastError: string | I18nMessage | null, failureCount: number): void {
  const envs = getEnvironments();
  const env = envs.find((e) => e.id === environmentId);
  if (!env) return;
  const ep = env.endpoints.find((e) => e.id === endpointId);
  if (!ep) return;
  ep.lastError = lastError;
  ep.failureCount = failureCount;
  store.set("environments", envs);
}

export function setEnvironmentAuthState(environmentId: string, authState: EnvironmentAuthState): void {
  const envs = store.get("environments", []);
  const env = envs.find((e) => e.id === environmentId);
  if (!env) return;
  env.authState = authState;
  store.set("environments", envs);
}

export function storeSessionToken(environmentId: string, token: SessionToken): boolean {
  const encrypted = encryptValue(token.accessToken);
  if (!encrypted) return false;
  const tokens = store.get("sessionTokens", {});
  tokens[environmentId] = {
    encryptedAccessToken: encrypted,
    scope: token.scope,
    expiresAt: token.expiresAt,
  };
  store.set("sessionTokens", tokens);
  setEnvironmentAuthState(environmentId, "paired");
  return true;
}

export function getSessionToken(environmentId: string): SessionToken | null {
  const tokens = store.get("sessionTokens", {});
  const entry = tokens[environmentId];
  if (!entry) return null;
  const accessToken = decryptValue(entry.encryptedAccessToken);
  if (!accessToken) return null;
  const token: SessionToken = {
    accessToken,
    scope: entry.scope,
    expiresAt: entry.expiresAt,
  };
  if (token.expiresAt !== null && Date.now() > token.expiresAt) {
    removeSessionToken(environmentId);
    setEnvironmentAuthState(environmentId, "blocked");
    return null;
  }
  return token;
}

export function removeSessionToken(environmentId: string): void {
  const tokens = store.get("sessionTokens", {});
  delete tokens[environmentId];
  store.set("sessionTokens", tokens);
}

export function setOpenCodeEndpoint(environmentId: string, endpoint: OpenCodeEndpoint | null): void {
  const envs = store.get("environments", []);
  const env = envs.find((e) => e.id === environmentId);
  if (!env) return;
  if (endpoint && endpoint.password) {
    const encrypted = encryptValue(endpoint.password);
    env.opencode = encrypted ? { ...endpoint, password: encrypted } : endpoint;
  } else {
    env.opencode = endpoint;
  }
  store.set("environments", envs);
}

export function setInfraOpenCodeEndpoint(environmentId: string, endpoint: OpenCodeEndpoint | null): void {
  const envs = store.get("environments", []);
  const env = envs.find((e) => e.id === environmentId);
  if (!env) return;
  env.infraOpenCode = endpoint;
  store.set("environments", envs);
}

export function getMainVmId(): string | null {
  ensureMigrated();
  const envs = store.get("environments", []);
  const mainVm = envs.find((e) => e.role === "main-vm");
  return mainVm?.id ?? null;
}

export function getMainVm(): EnvironmentWithFingerprint | null {
  ensureMigrated();
  const envs = store.get("environments", []);
  return envs.find((e) => e.role === "main-vm") ?? null;
}

export function setMainVm(environmentId: string): void {
  const envs = store.get("environments", []);
  for (const env of envs) {
    if (env.role === "main-vm") {
      env.role = "coding";
    }
  }
  const target = envs.find((e) => e.id === environmentId);
  if (target) {
    target.role = "main-vm";
  }
  store.set("environments", envs);
}

export function autoPromoteFirstEnvIfNeeded(): void {
  const envs = store.get("environments", []);
  if (envs.length === 0) return;
  const hasMainVm = envs.some((e) => e.role === "main-vm");
  if (!hasMainVm) {
    envs[0].role = "main-vm";
    store.set("environments", envs);
  }
}

export async function exchangePairingCode(
  baseUrl: string,
  code: string,
  scope: SessionScope = "read-only",
): Promise<PairingCodeExchangeResponse> {
  try {
    const url = `${baseUrl.replace(/\/+$/, "")}/api/pair/exchange`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, scope }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let errorMsg = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string } };
        if (parsed.error?.message) errorMsg = parsed.error.message;
      } catch { /* use default */ }
      return { ok: false, error: errorMsg };
    }

    const data = await res.json() as unknown;
    if (typeof data !== "object" || data === null || !("accessToken" in data)) {
      return { ok: false, error: msg("vmWizard.mainInvalidPairingResponse") };
    }

    const response = data as { accessToken: string; scope?: SessionScope; expiresAt?: number | null };
    const token: SessionToken = {
      accessToken: response.accessToken,
      scope: response.scope ?? scope,
      expiresAt: response.expiresAt ?? null,
    };
    return { ok: true, token };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export function encryptValue(plaintext: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null;
  return safeStorage.encryptString(plaintext).toString("base64");
}

export function decryptValue(encryptedBase64: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const buffer = Buffer.from(encryptedBase64, "base64");
    return safeStorage.decryptString(buffer);
  } catch {
    return null;
  }
}
