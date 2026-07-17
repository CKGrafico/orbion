import Store from "electron-store";
import { safeStorage } from "electron";
import type { AccessEndpoint, EndpointKind, Environment, EnvironmentRole, SessionScope, SessionToken, PairingCodeExchangeResponse, EnvironmentAuthState, OpenCodeEndpoint, SetOpenCodeEndpointResult, I18nMessage, BudgetWatch, BudgetBreach, ResolvedInboxItem } from "../shared/ipc.js";
import { trimTrailingSlash } from "../shared/utils.js";
import { fetchAndUnwrap } from "./http-utils.js";

interface LegacyInstance {
  id: string;
  name: string;
  baseUrl: string;
}

interface EnvironmentWithFingerprint extends Environment {
  fingerprintId?: string;
  authState?: EnvironmentAuthState;
  opencode?: InternalOpenCodeEndpoint | null;
  infraOpenCode?: InternalOpenCodeEndpoint | null;
  role?: EnvironmentRole;
}

/** Internal-only endpoint type with encryption metadata — never sent to renderer. */
export interface InternalOpenCodeEndpoint {
  url: string;
  password: string | null;
  wasEncrypted?: boolean;
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
  budgetWatches: BudgetWatch[];
  budgetBreaches: BudgetBreach[];
  inboxDismissedIds: string[];
  inboxResolvedItems: ResolvedInboxItem[];
  projectPickupLabels: Record<string, string[]>;
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
    budgetWatches: [],
    budgetBreaches: [],
    inboxDismissedIds: [],
    inboxResolvedItems: [],
    projectPickupLabels: {},
  },
});

// ---------------------------------------------------------------------------
// Write serialization — prevents read-modify-write races under concurrent IPC
// ---------------------------------------------------------------------------
let writeChain: Promise<void> = Promise.resolve();

function serialize<T>(fn: () => T): Promise<T> {
  const next = writeChain.then(() => fn());
  writeChain = next.catch((err) => {
    console.error("[config-store] serialized write failed:", err);
  });
  return next;
}

// ---------------------------------------------------------------------------
// Shared mutation helpers — eliminate read-modify-write duplication
// ---------------------------------------------------------------------------

/**
 * Read-find-mutate-write helper for a single environment.
 * Encapsulates: read environments array → find by ID → apply callback → write back.
 * Returns the mutated environment, or null if not found.
 *
 * Guarantees `store.set("environments", envs)` is always called after the callback,
 * eliminating the risk of a forgotten write.
 */
function mutateEnvironment(
  id: string,
  fn: (env: EnvironmentWithFingerprint) => void,
): EnvironmentWithFingerprint | null {
  const envs = store.get("environments", []);
  const env = envs.find((e) => e.id === id);
  if (!env) return null;
  fn(env);
  store.set("environments", envs);
  return env;
}

/**
 * Read-mutate-write helper for the full environments array.
 * Encapsulates: read → apply callback → write back.
 * Use when the mutation spans multiple environments or adds/removes entries.
 */
function mutateEnvironments(
  fn: (envs: EnvironmentWithFingerprint[]) => void,
): void {
  const envs = store.get("environments", []);
  fn(envs);
  store.set("environments", envs);
}

/**
 * Read-mutate-write helper for the session tokens record.
 * Encapsulates: read → apply callback → write back.
 */
function mutateSessionTokens(
  fn: (tokens: Record<string, EncryptedSessionToken>) => void,
): void {
  const tokens = store.get("sessionTokens", {});
  fn(tokens);
  store.set("sessionTokens", tokens);
}

// ---------------------------------------------------------------------------
// Migration (synchronous — only runs once at startup before IPC is active)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Read functions (synchronous — reads are consistent per-call and never lose data)
// ---------------------------------------------------------------------------

export function getEnvironments(): EnvironmentWithFingerprint[] {
  ensureMigrated();
  return store.get("environments", []);
}

/** Strip wasEncrypted from internal endpoints before sending to renderer. */
function sanitizeEndpoint(ep: InternalOpenCodeEndpoint | null | undefined): OpenCodeEndpoint | null | undefined {
  if (!ep) return ep;
  const { wasEncrypted: _, ...rest } = ep;
  return rest;
}

/** Get environments with wasEncrypted stripped from OpenCodeEndpoint fields (for IPC/renderer). */
export function getEnvironmentsForRenderer(): Environment[] {
  const envs = getEnvironments();
  return envs.map((env) => ({
    ...env,
    opencode: sanitizeEndpoint(env.opencode),
    infraOpenCode: sanitizeEndpoint(env.infraOpenCode),
  }));
}

export function findEnvironmentByFingerprint(fingerprintId: string): EnvironmentWithFingerprint | undefined {
  ensureMigrated();
  const envs = store.get("environments", []);
  return envs.find((e) => e.fingerprintId === fingerprintId);
}

export function getSelectedEnvironmentId(): string | null {
  ensureMigrated();
  return store.get("selectedEnvironmentId", null);
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
    void removeSessionToken(environmentId);
    void _setEnvironmentAuthState(environmentId, "blocked");
    return null;
  }
  return token;
}

// ---------------------------------------------------------------------------
// Mutation internals (unserialized — called from within serialize() only)
// ---------------------------------------------------------------------------

function _setEnvironmentFingerprintId(environmentId: string, fingerprintId: string): void {
  mutateEnvironment(environmentId, (env) => { env.fingerprintId = fingerprintId; });
}

function _addEnvironment(name: string, url: string, kind: EndpointKind = "direct", sshTarget?: string): Environment {
  ensureMigrated();
  const endpointId = crypto.randomUUID().slice(0, 8);
  const endpoint: AccessEndpoint = {
    id: endpointId,
    kind,
    url: trimTrailingSlash(url.trim()),
    sshTarget: sshTarget ?? null,
    lastError: null,
    failureCount: 0,
  };
  const env: Environment = {
    id: crypto.randomUUID().slice(0, 8),
    name: name.trim(),
    endpoints: [endpoint],
    activeEndpointId: endpointId,
  };
  mutateEnvironments((envs) => { envs.push(env as EnvironmentWithFingerprint); });
  return env;
}

function _removeEnvironment(id: string): void {
  mutateEnvironments((envs) => {
    const idx = envs.findIndex((e) => e.id === id);
    if (idx !== -1) envs.splice(idx, 1);
  });
  const selectedId = store.get("selectedEnvironmentId");
  if (selectedId === id) {
    store.set("selectedEnvironmentId", null);
  }
}

function _addEndpoint(environmentId: string, url: string, kind: EndpointKind): AccessEndpoint | null {
  let result: AccessEndpoint | null = null;
  const found = mutateEnvironment(environmentId, (env) => {
    const endpoint: AccessEndpoint = {
      id: crypto.randomUUID().slice(0, 8),
      kind,
      url: trimTrailingSlash(url.trim()),
      lastError: null,
      failureCount: 0,
    };
    env.endpoints = [...env.endpoints, endpoint];
    result = endpoint;
  });
  return found ? result : null;
}

function _removeEndpoint(environmentId: string, endpointId: string): void {
  mutateEnvironment(environmentId, (env) => {
    env.endpoints = env.endpoints.filter((ep) => ep.id !== endpointId);
    if (env.activeEndpointId === endpointId) {
      env.activeEndpointId = env.endpoints.length > 0 ? env.endpoints[0].id : null;
    }
  });
}

function _setActiveEndpoint(environmentId: string, endpointId: string): void {
  mutateEnvironment(environmentId, (env) => {
    if (!env.endpoints.some((ep) => ep.id === endpointId)) return;
    env.activeEndpointId = endpointId;
  });
}

function _setSelectedEnvironmentId(id: string | null): void {
  store.set("selectedEnvironmentId", id);
}

function _migrateFromLocalStorage(rawInstances: string, rawSelectedId: string | null): boolean {
  try {
    const parsed = JSON.parse(rawInstances) as LegacyInstance[];
    if (!Array.isArray(parsed)) return false;

    const current = store.get("environments", []);
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

function _updateEndpointHealth(environmentId: string, endpointId: string, lastError: string | I18nMessage | null, failureCount: number): void {
  mutateEnvironment(environmentId, (env) => {
    const ep = env.endpoints.find((e) => e.id === endpointId);
    if (!ep) return;
    ep.lastError = lastError;
    ep.failureCount = failureCount;
  });
}

function _setEnvironmentAuthState(environmentId: string, authState: EnvironmentAuthState): void {
  mutateEnvironment(environmentId, (env) => { env.authState = authState; });
}

function _storeSessionToken(environmentId: string, token: SessionToken): boolean {
  const encrypted = encryptValue(token.accessToken);
  if (!encrypted) return false;
  mutateSessionTokens((tokens) => {
    tokens[environmentId] = {
      encryptedAccessToken: encrypted,
      scope: token.scope,
      expiresAt: token.expiresAt,
    };
  });
  _setEnvironmentAuthState(environmentId, "paired");
  return true;
}

function _removeSessionToken(environmentId: string): void {
  mutateSessionTokens((tokens) => { delete tokens[environmentId]; });
}

/**
 * Shared implementation for setting an OpenCode-style endpoint with
 * optional password encryption. Used by both `_setOpenCodeEndpoint` and
 * `_setInfraOpenCodeEndpoint` to prevent security drift.
 *
 * @param field - The environment property to set (`"opencode"` or `"infraOpenCode"`).
 */
function _setEndpointWithEncryption(
  environmentId: string,
  endpoint: OpenCodeEndpoint | null,
  field: "opencode" | "infraOpenCode",
): SetOpenCodeEndpointResult {
  if (endpoint && endpoint.password) {
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, reason: "encryption-unavailable" };
    }
    const encrypted = encryptValue(endpoint.password);
    if (!encrypted) {
      return { ok: false, reason: "encryption-unavailable" };
    }
    const found = mutateEnvironment(environmentId, (env) => {
      env[field] = { ...endpoint, password: encrypted, wasEncrypted: true };
    });
    return { ok: true };
  }
  mutateEnvironment(environmentId, (env) => {
    env[field] = endpoint as InternalOpenCodeEndpoint | null;
  });
  return { ok: true };
}

function _setOpenCodeEndpoint(environmentId: string, endpoint: OpenCodeEndpoint | null): SetOpenCodeEndpointResult {
  return _setEndpointWithEncryption(environmentId, endpoint, "opencode");
}

function _setInfraOpenCodeEndpoint(environmentId: string, endpoint: OpenCodeEndpoint | null): SetOpenCodeEndpointResult {
  return _setEndpointWithEncryption(environmentId, endpoint, "infraOpenCode");
}

function _setMainVm(environmentId: string): void {
  mutateEnvironments((envs) => {
    for (const env of envs) {
      if (env.role === "main-vm") {
        env.role = "coding";
      }
    }
    const target = envs.find((e) => e.id === environmentId);
    if (target) {
      target.role = "main-vm";
    }
  });
}

function _autoPromoteFirstEnvIfNeeded(): void {
  mutateEnvironments((envs) => {
    if (envs.length === 0) return;
    if (!envs.some((e) => e.role === "main-vm")) {
      envs[0].role = "main-vm";
    }
  });
}

// ---------------------------------------------------------------------------
// Public mutating functions (serialized through write queue)
// ---------------------------------------------------------------------------

export function setEnvironmentFingerprintId(environmentId: string, fingerprintId: string): Promise<void> {
  return serialize(() => _setEnvironmentFingerprintId(environmentId, fingerprintId));
}

export function addEnvironment(name: string, url: string, kind: EndpointKind = "direct", sshTarget?: string): Promise<Environment> {
  return serialize(() => _addEnvironment(name, url, kind, sshTarget));
}

export function removeEnvironment(id: string): Promise<void> {
  return serialize(() => _removeEnvironment(id));
}

export function addEndpoint(environmentId: string, url: string, kind: EndpointKind): Promise<AccessEndpoint | null> {
  return serialize(() => _addEndpoint(environmentId, url, kind));
}

export function removeEndpoint(environmentId: string, endpointId: string): Promise<void> {
  return serialize(() => _removeEndpoint(environmentId, endpointId));
}

export function setActiveEndpoint(environmentId: string, endpointId: string): Promise<void> {
  return serialize(() => _setActiveEndpoint(environmentId, endpointId));
}

export function setSelectedEnvironmentId(id: string | null): Promise<void> {
  return serialize(() => _setSelectedEnvironmentId(id));
}

export function migrateFromLocalStorage(rawInstances: string, rawSelectedId: string | null): Promise<boolean> {
  return serialize(() => _migrateFromLocalStorage(rawInstances, rawSelectedId));
}

export function updateEndpointHealth(environmentId: string, endpointId: string, lastError: string | I18nMessage | null, failureCount: number): Promise<void> {
  return serialize(() => _updateEndpointHealth(environmentId, endpointId, lastError, failureCount));
}

export function setEnvironmentAuthState(environmentId: string, authState: EnvironmentAuthState): Promise<void> {
  return serialize(() => _setEnvironmentAuthState(environmentId, authState));
}

export function storeSessionToken(environmentId: string, token: SessionToken): Promise<boolean> {
  return serialize(() => _storeSessionToken(environmentId, token));
}

export function removeSessionToken(environmentId: string): Promise<void> {
  return serialize(() => _removeSessionToken(environmentId));
}

export function setOpenCodeEndpoint(environmentId: string, endpoint: OpenCodeEndpoint | null): Promise<SetOpenCodeEndpointResult> {
  return serialize(() => _setOpenCodeEndpoint(environmentId, endpoint));
}

export function setInfraOpenCodeEndpoint(environmentId: string, endpoint: OpenCodeEndpoint | null): Promise<SetOpenCodeEndpointResult> {
  return serialize(() => _setInfraOpenCodeEndpoint(environmentId, endpoint));
}

export function setMainVm(environmentId: string): Promise<void> {
  return serialize(() => _setMainVm(environmentId));
}

export function autoPromoteFirstEnvIfNeeded(): Promise<void> {
  return serialize(() => _autoPromoteFirstEnvIfNeeded());
}

// ---------------------------------------------------------------------------
// Budget watch persistence
// ---------------------------------------------------------------------------

export function getBudgetWatches(): BudgetWatch[] {
  return store.get("budgetWatches", []);
}

function _addBudgetWatch(watch: Omit<BudgetWatch, "id" | "createdAt">): BudgetWatch {
  const newWatch: BudgetWatch = {
    ...watch,
    id: crypto.randomUUID().slice(0, 8),
    createdAt: new Date().toISOString(),
  };
  const watches = store.get("budgetWatches", []);
  watches.push(newWatch);
  store.set("budgetWatches", watches);
  return newWatch;
}

function _removeBudgetWatch(watchId: string): void {
  const watches = store.get("budgetWatches", []);
  store.set("budgetWatches", watches.filter((w) => w.id !== watchId));
}

function _updateBudgetWatch(watchId: string, updates: Partial<Pick<BudgetWatch, "threshold" | "autoPause" | "enabled">>): void {
  const watches = store.get("budgetWatches", []);
  const idx = watches.findIndex((w) => w.id === watchId);
  if (idx !== -1) {
    watches[idx] = { ...watches[idx], ...updates };
    store.set("budgetWatches", watches);
  }
}

export function addBudgetWatch(watch: Omit<BudgetWatch, "id" | "createdAt">): Promise<BudgetWatch> {
  return serialize(() => _addBudgetWatch(watch));
}

export function removeBudgetWatch(watchId: string): Promise<void> {
  return serialize(() => _removeBudgetWatch(watchId));
}

export function updateBudgetWatch(watchId: string, updates: Partial<Pick<BudgetWatch, "threshold" | "autoPause" | "enabled">>): Promise<void> {
  return serialize(() => _updateBudgetWatch(watchId, updates));
}

// ---------------------------------------------------------------------------
// Budget breach persistence
// ---------------------------------------------------------------------------

export function getBudgetBreaches(): BudgetBreach[] {
  return store.get("budgetBreaches", []);
}

function _addBudgetBreach(breach: Omit<BudgetBreach, "id">): BudgetBreach {
  const newBreach: BudgetBreach = {
    ...breach,
    id: crypto.randomUUID().slice(0, 8),
  };
  const breaches = store.get("budgetBreaches", []);
  breaches.push(newBreach);
  store.set("budgetBreaches", breaches);
  return newBreach;
}

function _dismissBudgetBreach(breachId: string): void {
  const breaches = store.get("budgetBreaches", []);
  const idx = breaches.findIndex((b) => b.id === breachId);
  if (idx !== -1) {
    breaches[idx] = { ...breaches[idx], dismissed: true };
    store.set("budgetBreaches", breaches);
  }
}

function _pruneOldBreaches(): void {
  const breaches = store.get("budgetBreaches", []);
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days
  const pruned = breaches.filter(
    (b) => !b.dismissed || new Date(b.breachedAt).getTime() > cutoff,
  );
  if (pruned.length !== breaches.length) {
    store.set("budgetBreaches", pruned);
  }
}

export function addBudgetBreach(breach: Omit<BudgetBreach, "id">): Promise<BudgetBreach> {
  return serialize(() => _addBudgetBreach(breach));
}

export function dismissBudgetBreach(breachId: string): Promise<void> {
  return serialize(() => _dismissBudgetBreach(breachId));
}

export function pruneOldBreaches(): Promise<void> {
  return serialize(() => _pruneOldBreaches());
}

// ---------------------------------------------------------------------------
// Inbox dismissed items
// ---------------------------------------------------------------------------

function _getInboxDismissedIds(): string[] {
  return store.get("inboxDismissedIds", []);
}

function _dismissInboxItem(itemId: string): void {
  const ids = new Set(_getInboxDismissedIds());
  ids.add(itemId);
  store.set("inboxDismissedIds", [...ids]);
}

function _isInboxItemDismissed(itemId: string): boolean {
  return _getInboxDismissedIds().includes(itemId);
}

export function getInboxDismissedIds(): string[] {
  return _getInboxDismissedIds();
}

export function dismissInboxItem(itemId: string): Promise<void> {
  return serialize(() => _dismissInboxItem(itemId));
}

export function isInboxItemDismissed(itemId: string): boolean {
  return _isInboxItemDismissed(itemId);
}

// ---------------------------------------------------------------------------
// Inbox resolved items (Done archive)
// ---------------------------------------------------------------------------

const RESOLVED_ITEMS_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000; // 30 days

function _getResolvedItems(): ResolvedInboxItem[] {
  return store.get("inboxResolvedItems", []);
}

function _addResolvedItem(resolved: ResolvedInboxItem): void {
  const items = _getResolvedItems();
  // Don't add duplicates
  if (items.some((ri) => ri.item.id === resolved.item.id)) return;
  items.push(resolved);
  store.set("inboxResolvedItems", items);
}

function _pruneResolvedItems(): void {
  const cutoff = Date.now() - RESOLVED_ITEMS_RETENTION_MS;
  const items = _getResolvedItems().filter(
    (ri) => new Date(ri.resolvedAt).getTime() >= cutoff
  );
  store.set("inboxResolvedItems", items);
}

export function addResolvedItem(resolved: ResolvedInboxItem): Promise<void> {
  return serialize(() => _addResolvedItem(resolved));
}

export function getResolvedItems(): ResolvedInboxItem[] {
  _pruneResolvedItems(); // auto-prune on read
  return _getResolvedItems();
}

export function pruneResolvedItems(): Promise<void> {
  return serialize(() => _pruneResolvedItems());
}

// ---------------------------------------------------------------------------
// Project pickup labels persistence
// ---------------------------------------------------------------------------

export function getProjectPickupLabels(projectId: string): string[] {
  const all = store.get("projectPickupLabels", {});
  return all[projectId] ?? [];
}

function _setProjectPickupLabels(projectId: string, labels: string[]): void {
  const all = store.get("projectPickupLabels", {});
  all[projectId] = labels;
  store.set("projectPickupLabels", all);
}

export function setProjectPickupLabels(projectId: string, labels: string[]): Promise<void> {
  return serialize(() => _setProjectPickupLabels(projectId, labels));
}

// ---------------------------------------------------------------------------
// Network / crypto utilities (no store mutations)
// ---------------------------------------------------------------------------

export async function exchangePairingCode(
  baseUrl: string,
  code: string,
  scope: SessionScope = "read-only",
): Promise<PairingCodeExchangeResponse> {
  const result = await fetchAndUnwrap<{ accessToken: string; scope?: SessionScope; expiresAt?: number | null }>(
    `${trimTrailingSlash(baseUrl)}/api/pair/exchange`,
    {
      method: "POST",
      body: { code, scope },
      timeoutMs: 10_000,
      validateJson: (data) => {
        if (typeof data === "object" && data !== null && "accessToken" in data) {
          return data;
        }
        return null;
      },
      errorKey: "vmWizard.mainInvalidPairingResponse",
    },
  );

  if (result.ok) {
    const token: SessionToken = {
      accessToken: result.data.accessToken,
      scope: result.data.scope ?? scope,
      expiresAt: result.data.expiresAt ?? null,
    };
    return { ok: true, token };
  }

  return { ok: false, error: result.error };
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
