import type { I18nMessage, SessionScope, PairingCodeExchangeResponse, SweepEphemeralSessionsArgs, SweepEphemeralSessionsResult } from "./types-common.js";
import type { ChatSession } from "./types-chat.js";

export type EndpointKind = "direct" | "ssh" | "tailscale";

export interface AccessEndpoint {
  id: string;
  kind: EndpointKind;
  url: string;
  sshTarget?: string | null;
  lastError: string | I18nMessage | null;
  failureCount: number;
}

export type EnvironmentAuthState = "unauthenticated" | "paired" | "blocked" | "tampered" | "unknown";

export type EnvironmentRole = "coding" | "main-vm";

export type AgentRuntime = "opencode" | "claude";

export type RuntimeState = "available" | "unavailable" | "unknown";

export type ReasoningEffort = "low" | "medium" | "high";

export interface ModelInfo {
  id: string;
  label: string;
  provider: string;
  available: boolean;
  unavailableReason?: string;
  reasoningEfforts?: ReasoningEffort[];
}

export interface ListModelsResult {
  ok: boolean;
  models?: ModelInfo[];
  error?: string | I18nMessage;
}

export interface EnvironmentCredentialRefs {
  sessionToken?: string;
  sshKeyPassphrase?: string;
}

export type OpenCodeAuthState = "authenticated" | "unauthenticated" | "unknown";

export type OpenCodeErrorKind = "unreachable" | "rejected" | "unauthenticated" | "version" | null;

export interface OpenCodeConnectionStatus {
  authState: OpenCodeAuthState;
  errorKind: OpenCodeErrorKind;
  errorMessage: string | I18nMessage | null;
  serverVersion: string | null;
  connectedProviders: string[];
  checkedAt: number | null;
}

export interface OpenCodeEndpoint {
  url: string;
  password: string | null;
}

export type SetOpenCodeEndpointResult =
  | { ok: true }
  | { ok: false; reason: "encryption-unavailable" };

export interface Environment {
  id: string;
  name: string;
  role?: EnvironmentRole;
  agentRuntime: AgentRuntime;
  runtimeState?: RuntimeState;
  sshControlTarget?: string | null;
  credentialRefs?: EnvironmentCredentialRefs;
  endpoints: AccessEndpoint[];
  activeEndpointId: string | null;
  authState?: EnvironmentAuthState;
  opencode?: OpenCodeEndpoint | null;
  infraOpenCode?: OpenCodeEndpoint | null;
}

/** Parsed bootstrap seed: non-secret reach info for the config-home VM. */
export interface BootstrapSeed {
  kind: "ssh" | "direct";
  /** For SSH: "user@host:port". For direct: the URL. */
  target: string;
  name: string;
}

export type BootstrapSeedExportResult =
  | { ok: true; seed: string }
  | { ok: false; error: string | I18nMessage };

export type BootstrapSeedImportResult =
  | { ok: true; seed: BootstrapSeed }
  | { ok: false; error: string | I18nMessage };

export type RestoreAvailability =
  | { available: true; environmentCount: number; environmentNames: string[] }
  | { available: false; reason: string | I18nMessage };

export type PullRestoreResult =
  | { ok: true; restored: Environment[] }
  | { ok: false; error: string | I18nMessage };

export interface ConfigStamp {
  timestamp: number;
  revision: number;
}

export interface StaleConfigResult {
  stale: true;
  currentStamp: ConfigStamp;
  knownStamp: ConfigStamp;
}

export type StampCheckedWriteResult =
  | { ok: true; stamp: ConfigStamp }
  | { ok: false; stale: StaleConfigResult };

export interface GlobalSettings {
  theme: "dark" | "light" | "system";
  defaultAgentRuntime: AgentRuntime;
  configHomeVmId: string | null;
  ephemeralThresholdHours: number;
}

export interface ConfigBridge {
  getEnvironments: () => Promise<Environment[]>;
  addEnvironment: (name: string, url: string, kind?: EndpointKind) => Promise<Environment>;
  removeEnvironment: (id: string) => Promise<void>;
  updateEnvironment: (id: string, updates: { name?: string; agentRuntime?: AgentRuntime; sshControlTarget?: string | null }) => Promise<void>;
  addEndpoint: (environmentId: string, url: string, kind: EndpointKind) => Promise<AccessEndpoint | null>;
  removeEndpoint: (environmentId: string, endpointId: string) => Promise<void>;
  setActiveEndpoint: (environmentId: string, endpointId: string) => Promise<void>;
  getSelectedEnvironmentId: () => Promise<string | null>;
  setSelectedEnvironmentId: (id: string | null) => Promise<void>;
  migrateFromLocalStorage: (rawInstances: string, rawSelectedId: string | null) => Promise<boolean>;
  exchangePairingCode: (baseUrl: string, code: string, scope?: SessionScope) => Promise<PairingCodeExchangeResponse>;
  removeSessionToken: (environmentId: string) => Promise<void>;
  setOpenCodeEndpoint: (environmentId: string, endpoint: OpenCodeEndpoint | null) => Promise<SetOpenCodeEndpointResult>;
  setInfraOpenCodeEndpoint: (environmentId: string, endpoint: OpenCodeEndpoint | null) => Promise<SetOpenCodeEndpointResult>;
  setMainVm: (environmentId: string) => Promise<void>;
  getMainVmId: () => Promise<string | null>;
  getProjectPickupLabels: (projectId: string) => Promise<string[]>;
  setProjectPickupLabels: (projectId: string, labels: string[]) => Promise<void>;
  getProjectPipelineLabels: (projectId: string) => Promise<string[]>;
  setProjectPipelineLabels: (projectId: string, labels: string[]) => Promise<void>;
  getChatSessions: () => Promise<ChatSession[]>;
  addChatSession: (session: Omit<ChatSession, "id" | "createdAt">) => Promise<ChatSession>;
  removeChatSession: (sessionId: string) => Promise<void>;
  updateChatSession: (sessionId: string, updates: Partial<Pick<ChatSession, "title" | "lastActiveAt" | "projectName" | "environmentId" | "workingDirectory" | "activeRuntime" | "activeModel" | "reasoningEffort" | "persisted" | "turnCount" | "declineAutoPersistUntil" | "pinned">>) => Promise<void>;
  pinChatSession: (sessionId: string, pinned: boolean) => Promise<void>;
  renameChatSession: (sessionId: string, title: string) => Promise<void>;
  reorderChatSessions: (orderedSessionIds: string[]) => Promise<void>;
  getExpandedProjects: () => Promise<string[]>;
  setExpandedProjects: (expandedKeys: string[]) => Promise<void>;
  exportBootstrapSeed: () => Promise<BootstrapSeedExportResult>;
  importBootstrapSeed: (seedString: string) => Promise<BootstrapSeedImportResult>;
  checkRestoreAvailable: () => Promise<RestoreAvailability>;
  pullRestore: () => Promise<PullRestoreResult>;
  getConfigStamp: () => Promise<ConfigStamp>;
  stampCheckedSetMainVm: (environmentId: string, knownStamp: ConfigStamp) => Promise<StampCheckedWriteResult>;
  /** Force-write the main-VM designate regardless of staleness (last-write-wins with explicit consent). */
  forceSetMainVm: (environmentId: string) => Promise<ConfigStamp>;
  sweepEphemeralSessions: (args: SweepEphemeralSessionsArgs) => Promise<SweepEphemeralSessionsResult>;
}
