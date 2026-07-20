import Store from "electron-store";
import { safeStorage } from "electron";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AccessEndpoint, AgentRuntime, EndpointKind, Environment, EnvironmentRole, SessionScope, SessionToken, PairingCodeExchangeResponse, EnvironmentAuthState, OpenCodeEndpoint, SetOpenCodeEndpointResult, I18nMessage, BudgetWatch, BudgetBreach, ResolvedInboxItem, RuntimeState, ChatSession, BootstrapSeedExportResult, BootstrapSeedImportResult, RestoreAvailability, PullRestoreResult, ConfigStamp, StaleConfigResult, StampCheckedWriteResult } from "../shared/ipc.js";
import { trimTrailingSlash, encodeBootstrapSeed, decodeBootstrapSeed } from "../shared/utils.js";
import { getCredential, pruneOrphanCredentials, removeCredential, storeCredential } from "./credential-vault.js";
import { fetchAndUnwrap } from "./http-utils.js";
import { parseTarget, buildSshArgs } from "./ssh-config.js";
import { msg } from "./i18n.js";

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
  projectPipelineLabels: Record<string, string[]>;
  chatSessions: ChatSession[];
  expandedProjects: string[];
  configStamp: ConfigStamp;
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
    projectPipelineLabels: {},
    chatSessions: [],
    expandedProjects: [],
    configStamp: { timestamp: Date.now(), revision: 0 },
  },
});

// ---------------------------------------------------------------------------
// Write serialization — prevents read-modify-write races under concurrent IPC
// ---------------------------------------------------------------------------
let writeChain: Promise<void> = Promise.resolve();
const pendingLegacyTokenMaintenance = new Set<string>();

function serialize<T>(fn: () => T): Promise<T> {
  const next = writeChain.then(() => fn());
  writeChain = next.then(
    () => undefined,
    (err) => { console.error("[config-store] serialized write failed:", err); },
  );
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
 * Bumps the config stamp on every write.
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
  bumpStamp();
  return env;
}

/**
 * Read-mutate-write helper for the full environments array.
 * Encapsulates: read → apply callback → write back.
 * Use when the mutation spans multiple environments or adds/removes entries.
 * Bumps the config stamp on every write.
 */
function mutateEnvironments(
  fn: (envs: EnvironmentWithFingerprint[]) => void,
): void {
  const envs = store.get("environments", []);
  fn(envs);
  store.set("environments", envs);
  bumpStamp();
}

/**
 * Read-mutate-write helper for the session tokens record.
 * Encapsulates: read → apply callback → write back.
 * Bumps the config stamp on every write.
 */
function mutateSessionTokens(
  fn: (tokens: Record<string, EncryptedSessionToken>) => void,
): void {
  const tokens = store.get("sessionTokens", {});
  fn(tokens);
  store.set("sessionTokens", tokens);
  bumpStamp();
}

// ---------------------------------------------------------------------------
// Migration (synchronous — only runs once at startup before IPC is active)
// ---------------------------------------------------------------------------

/**
 * Collect all credential references currently in use by environments.
 * Used by the orphan-pruning logic to determine which credentials are still needed.
 */
function collectActiveCredentialReferences(): Set<string> {
  const references = new Set<string>();
  for (const env of store.get("environments", [])) {
    if (env.credentialRefs) {
      for (const ref of Object.values(env.credentialRefs)) {
        if (ref) references.add(ref);
      }
    }
  }
  return references;
}

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
        agentRuntime: "opencode",
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

/**
 * Run once at startup to prune orphaned credentials that no longer
 * have any environment referencing them. Called after ensureMigrated().
 */
function pruneOrphanCredentialsOnStartup(): void {
  pruneOrphanCredentials(collectActiveCredentialReferences());
}

// ---------------------------------------------------------------------------
// Read functions (synchronous — reads are consistent per-call and never lose data)
// ---------------------------------------------------------------------------

// Track whether startup pruning has been performed to avoid repeated work.
let startupPruningDone = false;

export function getEnvironments(): EnvironmentWithFingerprint[] {
  ensureMigrated();
  if (!startupPruningDone) {
    startupPruningDone = true;
    pruneOrphanCredentialsOnStartup();
  }
  return store.get("environments", []).map((env) => ({
    ...env,
    agentRuntime: env.agentRuntime ?? "opencode",
  }));
}

// ---------------------------------------------------------------------------
// Sync-safe serialization — structurally excludes secret fields
// ---------------------------------------------------------------------------

/**
 * Field names that are known secrets or internal security metadata.
 * If any of these appear in serialized output, the serialization layer
 * is broken. The test suite asserts against this list.
 *
 * - password: plaintext or encrypted password on OpenCode endpoints
 * - wasEncrypted: internal encryption metadata on InternalOpenCodeEndpoint
 * - encryptedAccessToken: ciphertext in legacy EncryptedSessionToken
 * - encryptedValue: ciphertext in credential-vault CredentialRecord
 * - accessToken: plaintext session token value
 */
export const SECRET_FIELD_NAMES: readonly string[] = [
  "password",
  "wasEncrypted",
  "encryptedAccessToken",
  "encryptedValue",
  "accessToken",
] as const;

/**
 * Fields safe to include in a synced/serialized environment.
 * Uses an explicit allowlist so that adding a new field to
 * EnvironmentWithFingerprint requires a deliberate decision here.
 * If a field is not listed, it is silently dropped by sanitizeEnvironmentForSync.
 */
const SAFE_ENVIRONMENT_KEYS: ReadonlySet<string> = new Set([
  "id",
  "name",
  "role",
  "agentRuntime",
  "runtimeState",
  "credentialRefs",
  "endpoints",
  "activeEndpointId",
  "authState",
  "opencode",
  "infraOpenCode",
  "fingerprintId",
]);

/**
 * Fields safe to include on an AccessEndpoint in synced output.
 */
const SAFE_ENDPOINT_KEYS: ReadonlySet<string> = new Set([
  "id",
  "kind",
  "url",
  "sshTarget",
  "lastError",
  "failureCount",
]);

/**
 * Fields safe to include on a credentialRefs object in synced output.
 * Only opaque reference identifiers — never credential values or ciphertext.
 */
const SAFE_CREDENTIAL_REF_KEYS: ReadonlySet<string> = new Set([
  "sessionToken",
  "sshKeyPassphrase",
]);

/**
 * Fields safe to include on an OpenCode-style endpoint in synced output.
 * The `password` field is NEVER included — only the `url` is synced.
 */
const SAFE_OPENCODE_ENDPOINT_KEYS: ReadonlySet<string> = new Set([
  "url",
]);

/**
 * Structurally sanitize a single environment for sync/serialization.
 * Uses allowlists at every nesting level so that secret fields cannot
 * accidentally leak into serialized output, even if new fields are
 * added to the internal types later.
 */
function sanitizeEnvironmentForSync(env: EnvironmentWithFingerprint): Environment {
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(env)) {
    if (!SAFE_ENVIRONMENT_KEYS.has(key)) continue;

    if (key === "credentialRefs" && env.credentialRefs) {
      const refs: Record<string, unknown> = {};
      for (const refKey of Object.keys(env.credentialRefs)) {
        if (SAFE_CREDENTIAL_REF_KEYS.has(refKey)) {
          const value = (env.credentialRefs as Record<string, unknown>)[refKey];
          if (value != null) refs[refKey] = value;
        }
      }
      result.credentialRefs = Object.keys(refs).length > 0 ? refs : undefined;
    } else if (key === "endpoints") {
      result.endpoints = env.endpoints.map((ep) => {
        const safeEp: Record<string, unknown> = {};
        for (const epKey of Object.keys(ep)) {
          if (SAFE_ENDPOINT_KEYS.has(epKey)) {
            safeEp[epKey] = (ep as Record<string, unknown>)[epKey];
          }
        }
        return safeEp;
      });
    } else if (key === "opencode" || key === "infraOpenCode") {
      const endpoint = env[key] as InternalOpenCodeEndpoint | null | undefined;
      if (endpoint) {
        const safeE: Record<string, unknown> = {};
        for (const eKey of Object.keys(endpoint)) {
          if (SAFE_OPENCODE_ENDPOINT_KEYS.has(eKey)) {
            safeE[eKey] = (endpoint as Record<string, unknown>)[eKey];
          }
        }
        result[key] = safeE;
      } else {
        result[key] = endpoint;
      }
    } else {
      (result as Record<string, unknown>)[key] = (env as Record<string, unknown>)[key];
    }
  }

  return result as unknown as Environment;
}

/**
 * Check whether a serialized JSON string contains any known secret field names.
 * Returns the first secret field name found, or null if the output is clean.
 */
export function findSecretFieldInJson(serialized: string): string | null {
  for (const field of SECRET_FIELD_NAMES) {
    // Match the field name as a JSON key: `"fieldName"`
    const pattern = `"${field}"`;
    if (serialized.includes(pattern)) {
      return field;
    }
  }
  return null;
}

/** Get environments structurally sanitized for IPC/renderer/sync. */
export function getEnvironmentsForRenderer(): Environment[] {
  return getEnvironments().map(sanitizeEnvironmentForSync);
}

export function findEnvironmentByFingerprint(fingerprintId: string): EnvironmentWithFingerprint | undefined {
  return getEnvironments().find((env) => env.fingerprintId === fingerprintId);
}

export function getSelectedEnvironmentId(): string | null {
  ensureMigrated();
  return store.get("selectedEnvironmentId", null);
}

export function getMainVmId(): string | null {
  const mainVm = getEnvironments().find((env) => env.role === "main-vm");
  return mainVm?.id ?? null;
}

export function getMainVm(): EnvironmentWithFingerprint | null {
  return getEnvironments().find((env) => env.role === "main-vm") ?? null;
}

export function getSessionToken(environmentId: string): SessionToken | null {
  const env = getEnvironments().find((candidate) => candidate.id === environmentId);
  const reference = env?.credentialRefs?.sessionToken;
  if (reference) {
    const serializedToken = getCredential(reference);
    if (!serializedToken) return null;
    const token = parseSessionToken(serializedToken);
    if (!token) return null;
    if (token.expiresAt !== null && Date.now() > token.expiresAt) {
      void removeSessionToken(environmentId);
      void _setEnvironmentAuthState(environmentId, "blocked");
      return null;
    }
    queueLegacySessionTokenMaintenance(environmentId);
    return token;
  }

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
  queueLegacySessionTokenMaintenance(environmentId, token);
  return token;
}

export function getSshKeyPassphrase(environmentId: string): string | null {
  const env = getEnvironments().find((candidate) => candidate.id === environmentId);
  const reference = env?.credentialRefs?.sshKeyPassphrase;
  return reference ? getCredential(reference) : null;
}

function parseSessionToken(value: string): SessionToken | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) return null;
    if (!("accessToken" in parsed) || typeof parsed.accessToken !== "string") return null;
    if (!("scope" in parsed) || !isSessionScope(parsed.scope)) return null;
    if (!("expiresAt" in parsed) || (parsed.expiresAt !== null && typeof parsed.expiresAt !== "number")) return null;
    return {
      accessToken: parsed.accessToken,
      scope: parsed.scope,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

function isSessionScope(value: unknown): value is SessionScope {
  return value === "read-only" || value === "operate" || value === "admin";
}

function queueLegacySessionTokenMaintenance(environmentId: string, token?: SessionToken): Promise<void> {
  if (pendingLegacyTokenMaintenance.has(environmentId)) return Promise.resolve();
  pendingLegacyTokenMaintenance.add(environmentId);
  return serialize(() => {
    if (token) {
      migrateLegacySessionToken(environmentId, token);
    } else {
      cleanupLegacySessionToken(environmentId);
    }
  }).then(
    () => { pendingLegacyTokenMaintenance.delete(environmentId); },
    (err) => { pendingLegacyTokenMaintenance.delete(environmentId); throw err; },
  );
}

function migrateLegacySessionToken(environmentId: string, token: SessionToken): void {
  const envs = store.get("environments", []);
  const env = envs.find((candidate) => candidate.id === environmentId);
  if (!env || env.credentialRefs?.sessionToken) return;

  let reference: string | null;
  try {
    reference = storeCredential(JSON.stringify(token));
  } catch (error) {
    console.error("[config-store] legacy session token vault migration failed:", error);
    return;
  }
  if (!reference) return;

  env.credentialRefs = { ...env.credentialRefs, sessionToken: reference };
  try {
    store.set("environments", envs);
  } catch (error) {
    removeCredential(reference);
    console.error("[config-store] legacy session token reference attachment failed:", error);
    return;
  }
  cleanupLegacySessionToken(environmentId);
}

function cleanupLegacySessionToken(environmentId: string): void {
  try {
    mutateSessionTokens((tokens) => { delete tokens[environmentId]; });
  } catch (error) {
    console.error("[config-store] legacy session token cleanup failed:", error);
  }
}

// ---------------------------------------------------------------------------
// Versioned config stamp — bumped on every mutating write
// ---------------------------------------------------------------------------

function currentStamp(): ConfigStamp {
  return store.get("configStamp", { timestamp: Date.now(), revision: 0 });
}

function bumpStamp(): void {
  const prev = currentStamp();
  store.set("configStamp", { timestamp: Date.now(), revision: prev.revision + 1 });
  scheduleConfigSyncToMainVm();
}

/** Get the current config stamp (read-only, synchronous). */
export function getConfigStamp(): ConfigStamp {
  return currentStamp();
}

/**
 * Stamp-checked set-main-VM: writes only if the file's current stamp
 * matches `knownStamp`. Returns a `StaleConfigResult` on conflict.
 */
function _stampCheckedSetMainVm(environmentId: string, knownStamp: ConfigStamp): StampCheckedWriteResult {
  const onDisk = currentStamp();
  if (onDisk.revision !== knownStamp.revision || onDisk.timestamp !== knownStamp.timestamp) {
    const staleResult: StaleConfigResult = {
      stale: true,
      currentStamp: onDisk,
      knownStamp,
    };
    return { ok: false, stale: staleResult };
  }
  _setMainVm(environmentId);
  bumpStamp();
  return { ok: true, stamp: currentStamp() };
}

/**
 * Force-set the main-VM designate regardless of staleness.
 * Last-write-wins with explicit user consent.
 */
function _forceSetMainVm(environmentId: string): ConfigStamp {
  _setMainVm(environmentId);
  bumpStamp();
  return currentStamp();
}

export function stampCheckedSetMainVm(environmentId: string, knownStamp: ConfigStamp): Promise<StampCheckedWriteResult> {
  return serialize(() => _stampCheckedSetMainVm(environmentId, knownStamp));
}

export function forceSetMainVm(environmentId: string): Promise<ConfigStamp> {
  return serialize(() => _forceSetMainVm(environmentId));
}

// ---------------------------------------------------------------------------
// Config sync to main-VM (debounced write to ~/.orbion/config.json)
// ---------------------------------------------------------------------------

/** Debounce timer for config sync to main-VM. */
let configSyncTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounce interval in milliseconds. */
const CONFIG_SYNC_DEBOUNCE_MS = 2_000;

/**
 * Schedule a debounced config sync to the main-VM.
 * Called from bumpStamp() on every config mutation.
 * Resets the timer on each call, so rapid mutations are coalesced.
 */
function scheduleConfigSyncToMainVm(): void {
  if (configSyncTimer !== null) {
    clearTimeout(configSyncTimer);
  }
  configSyncTimer = setTimeout(() => {
    configSyncTimer = null;
    syncConfigToMainVm().catch((err) => {
      console.error("[config-store] config sync to main-VM failed:", err);
    });
  }, CONFIG_SYNC_DEBOUNCE_MS);
}

/**
 * Write the sanitized config to the main-VM's ~/.orbion/config.json.
 * Skips if no main-VM is designated. Uses SSH for remote VMs,
 * local filesystem for direct endpoints.
 */
async function syncConfigToMainVm(): Promise<void> {
  const mainVm = getMainVm();
  if (!mainVm) return;

  const activeEndpoint = mainVm.endpoints.find((ep) => ep.id === mainVm.activeEndpointId) ?? mainVm.endpoints[0];
  if (!activeEndpoint) return;

  // Build the sanitized payload — same allowlist as IPC renderer output
  const environments = getEnvironmentsForRenderer();
  const payload = JSON.stringify(
    { environments, configStamp: currentStamp() },
    null,
    2,
  );

  if (activeEndpoint.kind === "ssh" && activeEndpoint.sshTarget) {
    await sshOnMainVmWrite(payload);
  } else if (activeEndpoint.kind === "direct") {
    localConfigWrite(payload);
  }
  // Tailscale and other kinds: not supported for config-home write yet
}

/**
 * Write config to the main-VM over SSH by piping the JSON payload via stdin.
 * The remote command creates the directory, writes the file, and sets permissions.
 */
async function sshOnMainVmWrite(payload: string): Promise<void> {
  const mainVm = getMainVm();
  if (!mainVm) return;

  const activeEndpoint = mainVm.endpoints.find((ep) => ep.id === mainVm.activeEndpointId) ?? mainVm.endpoints[0];
  if (!activeEndpoint || activeEndpoint.kind !== "ssh" || !activeEndpoint.sshTarget) return;

  const sshHost = parseTarget(activeEndpoint.sshTarget);
  if (!sshHost) return;

  // Remote command: ensure directory exists, write from stdin, set permissions
  const remoteCommand = `mkdir -p ~/.orbion && cat > ~/.orbion/config.json && chmod 600 ~/.orbion/config.json`;
  const args = buildSshArgs(sshHost, remoteCommand);

  return new Promise((resolve) => {
    const proc = execFile("ssh", args, { timeout: 15_000 }, (err) => {
      if (err) {
        console.error("[config-store] SSH write to main-VM failed:", err.message);
        // Non-blocking: just log and continue
      }
      resolve();
    });
    // Pipe the JSON payload via stdin
    proc.stdin?.end(payload, "utf8");
  });
}

/**
 * Write config to the local filesystem for direct endpoints.
 * The "VM" is the local machine in this scenario.
 */
function localConfigWrite(payload: string): void {
  try {
    const configDir = path.join(os.homedir(), ".orbion");
    const configPath = path.join(configDir, "config.json");

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }

    fs.writeFileSync(configPath, payload, { encoding: "utf8", mode: 0o600 });
  } catch (err) {
    console.error("[config-store] local config write failed:", err);
    // Non-blocking: just log and continue
  }
}

// ---------------------------------------------------------------------------
// Mutation internals (unserialized — called from within serialize() only)
// ---------------------------------------------------------------------------

function _setEnvironmentFingerprintId(environmentId: string, fingerprintId: string): void {
  mutateEnvironment(environmentId, (env) => { env.fingerprintId = fingerprintId; });
}

function _addEnvironment(
  name: string,
  url: string,
  kind: EndpointKind = "direct",
  sshTarget?: string,
  agentRuntime: AgentRuntime = "opencode",
): Environment {
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
    agentRuntime,
    endpoints: [endpoint],
    activeEndpointId: endpointId,
  };
  mutateEnvironments((envs) => { envs.push(env as EnvironmentWithFingerprint); });
  return env;
}

function _removeEnvironment(id: string): void {
  const env = store.get("environments", []).find((candidate) => candidate.id === id);
  if (env?.credentialRefs) {
    for (const reference of Object.values(env.credentialRefs)) {
      if (reference) removeCredential(reference);
    }
  }
  mutateSessionTokens((tokens) => { delete tokens[id]; });
  mutateEnvironments((envs) => {
    const idx = envs.findIndex((e) => e.id === id);
    if (idx !== -1) envs.splice(idx, 1);
  });
  const selectedId = store.get("selectedEnvironmentId");
  if (selectedId === id) {
    store.set("selectedEnvironmentId", null);
    bumpStamp();
  }
  // Prune any orphaned credentials left behind after environment removal.
  pruneOrphanCredentials(collectActiveCredentialReferences());
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
  bumpStamp();
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
          agentRuntime: "opencode",
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

function _setEnvironmentRuntimeState(environmentId: string, runtimeState: RuntimeState): void {
  mutateEnvironment(environmentId, (env) => { env.runtimeState = runtimeState; });
}

function _storeSessionToken(environmentId: string, token: SessionToken): boolean {
  const reference = storeCredential(JSON.stringify(token));
  if (!reference) return false;
  const previousReference = store.get("environments", [])
    .find((candidate) => candidate.id === environmentId)
    ?.credentialRefs?.sessionToken;
  let found: EnvironmentWithFingerprint | null;
  try {
    found = mutateEnvironment(environmentId, (env) => {
      env.credentialRefs = { ...env.credentialRefs, sessionToken: reference };
    });
  } catch (error) {
    removeCredential(reference);
    throw error;
  }
  if (!found) {
    removeCredential(reference);
    return false;
  }
  if (previousReference) removeCredential(previousReference);
  mutateSessionTokens((tokens) => { delete tokens[environmentId]; });
  _setEnvironmentAuthState(environmentId, "paired");
  return true;
}

function _removeSessionToken(environmentId: string): void {
  const env = store.get("environments", []).find((candidate) => candidate.id === environmentId);
  const reference = env?.credentialRefs?.sessionToken;
  if (reference) removeCredential(reference);
  mutateEnvironment(environmentId, (candidate) => {
    if (!candidate.credentialRefs) return;
    const { sessionToken: _, ...remainingRefs } = candidate.credentialRefs;
    candidate.credentialRefs = Object.keys(remainingRefs).length > 0 ? remainingRefs : undefined;
  });
  mutateSessionTokens((tokens) => { delete tokens[environmentId]; });
}

function _storeSshKeyPassphrase(environmentId: string, passphrase: string): boolean {
  const reference = storeCredential(passphrase);
  if (!reference) return false;
  const previousReference = store.get("environments", [])
    .find((candidate) => candidate.id === environmentId)
    ?.credentialRefs?.sshKeyPassphrase;
  let found: EnvironmentWithFingerprint | null;
  try {
    found = mutateEnvironment(environmentId, (env) => {
      env.credentialRefs = { ...env.credentialRefs, sshKeyPassphrase: reference };
    });
  } catch (error) {
    removeCredential(reference);
    throw error;
  }
  if (!found) {
    removeCredential(reference);
    return false;
  }
  if (previousReference) removeCredential(previousReference);
  return true;
}

function _removeSshKeyPassphrase(environmentId: string): void {
  const env = store.get("environments", []).find((candidate) => candidate.id === environmentId);
  const reference = env?.credentialRefs?.sshKeyPassphrase;
  if (reference) removeCredential(reference);
  mutateEnvironment(environmentId, (candidate) => {
    if (!candidate.credentialRefs) return;
    const { sshKeyPassphrase: _, ...remainingRefs } = candidate.credentialRefs;
    candidate.credentialRefs = Object.keys(remainingRefs).length > 0 ? remainingRefs : undefined;
  });
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
    mutateEnvironment(environmentId, (env) => {
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

export function addEnvironment(
  name: string,
  url: string,
  kind: EndpointKind = "direct",
  sshTarget?: string,
  agentRuntime: AgentRuntime = "opencode",
): Promise<Environment> {
  return serialize(() => _addEnvironment(name, url, kind, sshTarget, agentRuntime));
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

export function setEnvironmentRuntimeState(environmentId: string, runtimeState: RuntimeState): Promise<void> {
  return serialize(() => _setEnvironmentRuntimeState(environmentId, runtimeState));
}

export function storeSessionToken(environmentId: string, token: SessionToken): Promise<boolean> {
  return serialize(() => _storeSessionToken(environmentId, token));
}

export function removeSessionToken(environmentId: string): Promise<void> {
  return serialize(() => _removeSessionToken(environmentId));
}

export function storeSshKeyPassphrase(environmentId: string, passphrase: string): Promise<boolean> {
  return serialize(() => _storeSshKeyPassphrase(environmentId, passphrase));
}

export function removeSshKeyPassphrase(environmentId: string): Promise<void> {
  return serialize(() => _removeSshKeyPassphrase(environmentId));
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
  bumpStamp();
  return newWatch;
}

function _removeBudgetWatch(watchId: string): void {
  const watches = store.get("budgetWatches", []);
  store.set("budgetWatches", watches.filter((w) => w.id !== watchId));
  bumpStamp();
}

function _updateBudgetWatch(watchId: string, updates: Partial<Pick<BudgetWatch, "threshold" | "autoPause" | "enabled">>): void {
  const watches = store.get("budgetWatches", []);
  const idx = watches.findIndex((w) => w.id === watchId);
  if (idx !== -1) {
    watches[idx] = { ...watches[idx], ...updates };
    store.set("budgetWatches", watches);
    bumpStamp();
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
  bumpStamp();
  return newBreach;
}

function _dismissBudgetBreach(breachId: string): void {
  const breaches = store.get("budgetBreaches", []);
  const idx = breaches.findIndex((b) => b.id === breachId);
  if (idx !== -1) {
    breaches[idx] = { ...breaches[idx], dismissed: true };
    store.set("budgetBreaches", breaches);
    bumpStamp();
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
    bumpStamp();
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
  bumpStamp();
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
  bumpStamp();
}

function _pruneResolvedItems(): void {
  const cutoff = Date.now() - RESOLVED_ITEMS_RETENTION_MS;
  const items = _getResolvedItems().filter(
    (ri) => new Date(ri.resolvedAt).getTime() >= cutoff
  );
  store.set("inboxResolvedItems", items);
  bumpStamp();
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
  bumpStamp();
}

export function setProjectPickupLabels(projectId: string, labels: string[]): Promise<void> {
  return serialize(() => _setProjectPickupLabels(projectId, labels));
}

// ---------------------------------------------------------------------------
// Project pipeline labels persistence
// ---------------------------------------------------------------------------

export function getProjectPipelineLabels(projectId: string): string[] {
  const all = store.get("projectPipelineLabels", {});
  return all[projectId] ?? [];
}

function _setProjectPipelineLabels(projectId: string, labels: string[]): void {
  const all = store.get("projectPipelineLabels", {});
  all[projectId] = labels;
  store.set("projectPipelineLabels", all);
  bumpStamp();
}

export function setProjectPipelineLabels(projectId: string, labels: string[]): Promise<void> {
  return serialize(() => _setProjectPipelineLabels(projectId, labels));
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

// ---------------------------------------------------------------------------
// Chat sessions — persisted in config store
// ---------------------------------------------------------------------------

export function getChatSessions(): ChatSession[] {
  return store.get("chatSessions", []);
}

export async function addChatSession(session: Omit<ChatSession, "id" | "createdAt">): Promise<ChatSession> {
  return serialize(() => {
    const sessions = store.get("chatSessions", []);
    const newSession: ChatSession = {
      ...session,
      id: `session-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
    };
    sessions.push(newSession);
    store.set("chatSessions", sessions);
    bumpStamp();
    return newSession;
  });
}

export function removeChatSession(sessionId: string): Promise<void> {
  return serialize(() => {
    const sessions = store.get("chatSessions", []);
    store.set("chatSessions", sessions.filter((s) => s.id !== sessionId));
    bumpStamp();
  });
}

export function updateChatSession(sessionId: string, updates: Partial<Pick<ChatSession, "title" | "lastActiveAt" | "projectName" | "environmentId" | "workingDirectory" | "activeRuntime" | "activeModel" | "reasoningEffort" | "persisted" | "turnCount" | "declineAutoPersistUntil">>): Promise<void> {
  return serialize(() => {
    const sessions = store.get("chatSessions", []);
    const idx = sessions.findIndex((s) => s.id === sessionId);
    if (idx >= 0) {
      sessions[idx] = { ...sessions[idx], ...updates };
      store.set("chatSessions", sessions);
      bumpStamp();
    }
  });
}

export interface SweepEphemeralSessionsArgs {
  activeSessionId: string | null;
  inactivityThresholdHours: number;
}

export interface SweepEphemeralSessionsResult {
  removedSessionIds: string[];
}

/**
 * Remove ephemeral sessions whose lastActiveAt exceeds the inactivity threshold.
 * Never removes the currently active session or persisted sessions.
 * Keys exclusively on lastActiveAt, never on createdAt.
 */
export async function sweepEphemeralSessions(args: SweepEphemeralSessionsArgs): Promise<SweepEphemeralSessionsResult> {
  const { activeSessionId, inactivityThresholdHours } = args;
  const cutoff = Date.now() - inactivityThresholdHours * 60 * 60 * 1000;
  const sessions = store.get("chatSessions", []) as ChatSession[];
  const removedIds: string[] = [];

  for (const session of sessions) {
    // Only sweep ephemeral (not persisted) sessions
    if (session.persisted) continue;
    // Never sweep the currently active session
    if (session.id === activeSessionId) continue;
    // Key on lastActiveAt only
    const lastActive = new Date(session.lastActiveAt).getTime();
    if (lastActive < cutoff) {
      removedIds.push(session.id);
    }
  }

  if (removedIds.length > 0) {
    const remaining = sessions.filter((s) => !removedIds.includes(s.id));
    store.set("chatSessions", remaining);
    bumpStamp();
  }

  return { removedSessionIds: removedIds };
}

// ---------------------------------------------------------------------------
// Expanded project state — persisted in config store
// ---------------------------------------------------------------------------

export function getExpandedProjects(): string[] {
  return store.get("expandedProjects", []);
}

export function setExpandedProjects(expandedKeys: string[]): Promise<void> {
  return serialize(() => {
    store.set("expandedProjects", expandedKeys);
    bumpStamp();
  });
}

// ---------------------------------------------------------------------------
// Bootstrap seed — portable config-home reach info (no secrets)
// ---------------------------------------------------------------------------

/**
 * Export a bootstrap seed for the main-VM environment.
 * The seed is a compact URI string containing only non-secret reach info
 * (host, port, method, name). Returns an error if no main-VM is set.
 */
export function exportBootstrapSeed(): BootstrapSeedExportResult {
  const mainVm = getMainVm();
  if (!mainVm) {
    return { ok: false, error: { key: "bootstrapSeed.noMainVm" } };
  }

  const activeEndpoint = mainVm.endpoints.find((ep) => ep.id === mainVm.activeEndpointId) ?? mainVm.endpoints[0];
  if (!activeEndpoint) {
    return { ok: false, error: { key: "bootstrapSeed.noEndpoint" } };
  }

  const kind = activeEndpoint.kind === "ssh" ? "ssh" as const : "direct" as const;
  const target = kind === "ssh" && activeEndpoint.sshTarget
    ? activeEndpoint.sshTarget
    : activeEndpoint.url;

  const seedString = encodeBootstrapSeed({
    kind,
    target,
    name: mainVm.name,
  });

  return { ok: true, seed: seedString };
}

/**
 * Import (parse) a bootstrap seed string.
 * Returns the parsed seed data or an error if the string is invalid.
 * Does NOT create an environment; the caller (wizard) handles that.
 */
export function importBootstrapSeed(seedString: string): BootstrapSeedImportResult {
  const seed = decodeBootstrapSeed(seedString);
  if (!seed) {
    return { ok: false, error: { key: "bootstrapSeed.invalidSeed" } };
  }
  return { ok: true, seed };
}

// ---------------------------------------------------------------------------
// Pull-canonical restore from config-home ────────────────────────────────
// ---------------------------------------------------------------------------

const REMOTE_CONFIG_PATH = "~/.orbion/config.json";

/**
 * Execute an SSH command on the main-VM and return stdout.
 * Returns null if the main-VM cannot be reached or has no SSH endpoint.
 */
function sshOnMainVm(command: string): Promise<string | null> {
  const mainVm = getMainVm();
  if (!mainVm) return Promise.resolve(null);

  const activeEndpoint = mainVm.endpoints.find((ep) => ep.id === mainVm.activeEndpointId) ?? mainVm.endpoints[0];
  if (!activeEndpoint) return Promise.resolve(null);

  // Only SSH endpoints can run remote commands
  // For direct/local endpoints, the "VM" is the local machine, so we can't
  // cat a remote config file. Direct mode is not the config-home scenario.
  if (activeEndpoint.kind !== "ssh" || !activeEndpoint.sshTarget) {
    return Promise.resolve(null);
  }

  const sshHost = parseTarget(activeEndpoint.sshTarget);
  if (!sshHost) return Promise.resolve(null);

  const args = buildSshArgs(sshHost, command);

  return new Promise((resolve) => {
    execFile("ssh", args, { timeout: 15_000 }, (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      resolve(stdout ?? "");
    });
  });
}

/**
 * Check whether the config-home VM has a config file available for restore.
 * Reads `~/.orbion/config.json` over SSH and counts environments.
 */
export async function checkRestoreAvailable(): Promise<RestoreAvailability> {
  const mainVm = getMainVm();
  if (!mainVm) {
    return { available: false, reason: { key: "restore.noMainVm" } };
  }

  const activeEndpoint = mainVm.endpoints.find((ep) => ep.id === mainVm.activeEndpointId) ?? mainVm.endpoints[0];
  if (!activeEndpoint) {
    return { available: false, reason: { key: "restore.noEndpoint" } };
  }

  if (activeEndpoint.kind !== "ssh" || !activeEndpoint.sshTarget) {
    return { available: false, reason: { key: "restore.notSshEndpoint" } };
  }

  // SSH to the main-VM and check if the config file exists and is readable
  const output = await sshOnMainVm(`cat ${REMOTE_CONFIG_PATH} 2>/dev/null`);
  if (output === null) {
    return { available: false, reason: { key: "restore.sshFailed" } };
  }

  if (output.trim().length === 0) {
    return { available: false, reason: { key: "restore.noConfigFile" } };
  }

  try {
    const parsed: unknown = JSON.parse(output);
    if (typeof parsed !== "object" || parsed === null) {
      return { available: false, reason: { key: "restore.invalidConfig" } };
    }

    const envs = (parsed as Record<string, unknown>)["environments"];
    if (!Array.isArray(envs)) {
      return { available: false, reason: { key: "restore.noEnvironments" } };
    }

    const names: string[] = [];
    for (const env of envs) {
      if (typeof env === "object" && env !== null && "name" in env) {
        const name = (env as Record<string, unknown>)["name"];
        if (typeof name === "string") names.push(name);
      }
    }

    if (names.length === 0) {
      return { available: false, reason: { key: "restore.emptyEnvironments" } };
    }

    return { available: true, environmentCount: names.length, environmentNames: names };
  } catch {
    return { available: false, reason: { key: "restore.invalidConfig" } };
  }
}

/**
 * Validate and sanitize a single environment parsed from the remote config.
 * Uses the same allowlist logic as `sanitizeEnvironmentForSync` to ensure
 * only safe fields are imported. Assigns new IDs so there is no collision
 * with existing local environments.
 */
function sanitizeRemoteEnvironment(raw: unknown): Environment | null {
  if (typeof raw !== "object" || raw === null) return null;

  const obj = raw as Record<string, unknown>;

  // Required fields
  if (typeof obj["name"] !== "string" || !obj["name"].trim()) return null;
  if (!Array.isArray(obj["endpoints"])) return null;

  const endpoints: AccessEndpoint[] = [];
  for (const rawEp of obj["endpoints"] as unknown[]) {
    if (typeof rawEp !== "object" || rawEp === null) continue;
    const ep = rawEp as Record<string, unknown>;

    if (typeof ep["url"] !== "string") continue;
    if (typeof ep["kind"] !== "string" || !["direct", "ssh", "tailscale"].includes(ep["kind"] as string)) continue;

    const endpoint: AccessEndpoint = {
      id: crypto.randomUUID().slice(0, 8),
      kind: ep["kind"] as EndpointKind,
      url: trimTrailingSlash(ep["url"].trim()),
      sshTarget: typeof ep["sshTarget"] === "string" ? ep["sshTarget"] : null,
      lastError: null,
      failureCount: 0,
    };
    endpoints.push(endpoint);
  }

  if (endpoints.length === 0) return null;

  const agentRuntime = obj["agentRuntime"] === "claude" ? "claude" as const : "opencode" as const;
  const runtimeState = typeof obj["runtimeState"] === "string"
    && ["available", "unavailable", "unknown"].includes(obj["runtimeState"] as string)
    ? obj["runtimeState"] as RuntimeState
    : undefined;

  const env: Environment = {
    id: crypto.randomUUID().slice(0, 8),
    name: (obj["name"] as string).trim(),
    agentRuntime,
    runtimeState,
    credentialRefs: undefined, // Never import credential references: they point to the remote keychain
    endpoints,
    activeEndpointId: endpoints[0].id,
    authState: "unauthenticated", // Restored environments need fresh auth
  };

  // Optional role: only preserve "main-vm" to maintain the designation.
  // We never import "main-vm" because this machine already has one.
  if (typeof obj["role"] === "string" && obj["role"] === "coding") {
    env.role = "coding";
  }

  // Optional OpenCode endpoint (URL only, no password)
  if (typeof obj["opencode"] === "object" && obj["opencode"] !== null) {
    const oc = obj["opencode"] as Record<string, unknown>;
    if (typeof oc["url"] === "string") {
      env.opencode = { url: oc["url"], password: null };
    }
  }

  return env;
}

/**
 * Pull-canonical restore from the config-home VM.
 * Reads the remote config file, replaces all local environments with
 * those from the VM (pull-only, no merge), and returns the restored list.
 */
export async function pullRestore(): Promise<PullRestoreResult> {
  const mainVm = getMainVm();
  if (!mainVm) {
    return { ok: false, error: { key: "restore.noMainVm" } };
  }

  const output = await sshOnMainVm(`cat ${REMOTE_CONFIG_PATH} 2>/dev/null`);
  if (output === null || output.trim().length === 0) {
    return { ok: false, error: { key: "restore.sshFailed" } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return { ok: false, error: { key: "restore.invalidConfig" } };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, error: { key: "restore.invalidConfig" } };
  }

  const rawEnvs = (parsed as Record<string, unknown>)["environments"];
  if (!Array.isArray(rawEnvs)) {
    return { ok: false, error: { key: "restore.noEnvironments" } };
  }

  // Sanitize and parse each environment from the remote config
  const restored: Environment[] = [];
  for (const rawEnv of rawEnvs) {
    const env = sanitizeRemoteEnvironment(rawEnv);
    if (env) restored.push(env);
  }

  if (restored.length === 0) {
    return { ok: false, error: { key: "restore.emptyEnvironments" } };
  }

  // Pull-only replacement: remove all existing local environments and
  // replace with the canonical set from the VM.
  await serialize(() => {
    // Remove credentials for all existing environments
    for (const env of store.get("environments", [])) {
      if (env.credentialRefs) {
        for (const reference of Object.values(env.credentialRefs)) {
          if (reference) removeCredential(reference);
        }
      }
    }

    // Replace environments wholesale with the restored set
    const restoredWithFingerprint: EnvironmentWithFingerprint[] = restored.map((env) => ({
      ...env,
      authState: "unauthenticated" as EnvironmentAuthState,
    }));
    store.set("environments", restoredWithFingerprint);

    // Clear legacy session tokens
    store.set("sessionTokens", {});

    // Select the first restored environment
    if (restoredWithFingerprint.length > 0) {
      store.set("selectedEnvironmentId", restoredWithFingerprint[0].id);
    }

    // Auto-promote the first environment to main-vm if none has the role
    _autoPromoteFirstEnvIfNeeded();

    // Bump the stamp after the wholesale replace
    bumpStamp();
  });

  // Prune orphaned credentials after clearing old environments
  pruneOrphanCredentials(collectActiveCredentialReferences());

  return { ok: true, restored };
}
