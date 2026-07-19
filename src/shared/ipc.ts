// Shared IPC contract between main, preload, and renderer.
// All HTTP to loop-task environments runs in the MAIN process: the loop-task
// daemon sends no CORS headers, so renderer fetch would be blocked, and
// main-process fetch also works unchanged for environments on remote VMs.

export interface I18nMessage {
  key: string;
  params?: Record<string, string | number>;
}

export interface ApiRequestArgs {
  baseUrl: string;
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string | I18nMessage;
}

export interface StreamSubscribeArgs {
  subId: string;
  baseUrl: string;
  path: string;
}

export interface StreamEventPayload {
  subId: string;
  kind: "data" | "event" | "end" | "error";
  text: string;
}

// ── Pairing & scoped sessions ──────────────────────────────────────

export type SessionScope = "read-only" | "operate" | "admin";

export interface SessionToken {
  accessToken: string;
  scope: SessionScope;
  expiresAt: number | null;
}

export interface PairingCodeExchangeResponse {
  ok: boolean;
  token?: SessionToken;
  error?: string | I18nMessage;
}

// ── Config store (electron-store) ───────────────────────────────────

export type EndpointKind = "direct" | "ssh" | "tailscale";

export interface AccessEndpoint {
  id: string;
  kind: EndpointKind;
  url: string;
  sshTarget?: string | null;
  lastError: string | I18nMessage | null;
  failureCount: number;
}

export type EnvironmentAuthState = "unauthenticated" | "paired" | "blocked" | "unknown";

export type EnvironmentRole = "coding" | "main-vm";

export type AgentRuntime = "opencode" | "claude";

export type RuntimeState = "available" | "unavailable" | "unknown";

/** A reasoning effort level supported by a model. */
export type ReasoningEffort = "low" | "medium" | "high";

/** A model offered by a runtime adapter, with availability metadata. */
export interface ModelInfo {
  /** Unique model identifier (e.g. "openai/gpt-4o", "anthropic/claude-3.5-sonnet"). */
  id: string;
  /** Human-readable display name. */
  label: string;
  /** The provider or runtime family (e.g. "openai", "anthropic"). */
  provider: string;
  /** Whether this model can currently be used. */
  available: boolean;
  /** Human-readable reason if unavailable. */
  unavailableReason?: string;
  /** Reasoning effort levels this model supports (empty if unsupported). */
  reasoningEfforts?: ReasoningEffort[];
}

/** Result of listing models from a runtime adapter. */
export interface ListModelsResult {
  ok: boolean;
  models?: ModelInfo[];
  error?: string | I18nMessage;
}

export interface EnvironmentCredentialRefs {
  sessionToken?: string;
  sshKeyPassphrase?: string;
}

export interface Environment {
  id: string;
  name: string;
  role?: EnvironmentRole;
  agentRuntime: AgentRuntime;
  runtimeState?: RuntimeState;
  credentialRefs?: EnvironmentCredentialRefs;
  endpoints: AccessEndpoint[];
  activeEndpointId: string | null;
  authState?: EnvironmentAuthState;
  opencode?: OpenCodeEndpoint | null;
  infraOpenCode?: OpenCodeEndpoint | null;
}

// ── Bootstrap seed (portable config-home reach info) ──────────────────

/** Parsed bootstrap seed: non-secret reach info for the config-home VM. */
export interface BootstrapSeed {
  /** Reach method: "ssh" or "direct". Maps to ReachMethod in the wizard. */
  kind: "ssh" | "direct";
  /** For SSH: "user@host:port". For direct: the URL. */
  target: string;
  /** Environment name (from the VM's config). */
  name: string;
}

/** Result of exporting a bootstrap seed from the main-VM. */
export type BootstrapSeedExportResult =
  | { ok: true; seed: string }
  | { ok: false; error: string | I18nMessage };

/** Result of importing (parsing) a bootstrap seed string. */
export type BootstrapSeedImportResult =
  | { ok: true; seed: BootstrapSeed }
  | { ok: false; error: string | I18nMessage };

// ── Pull-canonical restore from config-home ───────────────────────────

/** Whether a config-home VM has a config file available for restore. */
export type RestoreAvailability =
  | { available: true; environmentCount: number; environmentNames: string[] }
  | { available: false; reason: string | I18nMessage };

/** Result of a pull-canonical restore from the config-home VM. */
export type PullRestoreResult =
  | { ok: true; restored: Environment[] }
  | { ok: false; error: string | I18nMessage };

// ── Versioned config writes with stale-overwrite warning ──────────────

/** A version stamp attached to every config write. */
export interface ConfigStamp {
  /** Wall-clock timestamp (Date.now()) of the last write. */
  timestamp: number;
  /** Monotonically increasing revision counter. */
  revision: number;
}

/** Result of a stamp-checked write that detected a conflict. */
export interface StaleConfigResult {
  /** True when the file's current stamp is newer than the caller's last-known stamp. */
  stale: true;
  /** The stamp on disk (newer than what the caller held). */
  currentStamp: ConfigStamp;
  /** The stamp the caller held at the time of the write attempt. */
  knownStamp: ConfigStamp;
}

/** Result of a stamp-checked write: either a clean write or a stale conflict. */
export type StampCheckedWriteResult =
  | { ok: true; stamp: ConfigStamp }
  | { ok: false; stale: StaleConfigResult };

export interface ConfigBridge {
  getEnvironments: () => Promise<Environment[]>;
  addEnvironment: (name: string, url: string, kind?: EndpointKind) => Promise<Environment>;
  removeEnvironment: (id: string) => Promise<void>;
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
  getChatSessions: () => Promise<ChatSession[]>;
  addChatSession: (session: Omit<ChatSession, "id" | "createdAt">) => Promise<ChatSession>;
  removeChatSession: (sessionId: string) => Promise<void>;
  updateChatSession: (sessionId: string, updates: Partial<Pick<ChatSession, "title" | "lastActiveAt" | "environmentId" | "workingDirectory" | "activeRuntime" | "activeModel" | "reasoningEffort">>) => Promise<void>;
  getExpandedProjects: () => Promise<string[]>;
  setExpandedProjects: (expandedKeys: string[]) => Promise<void>;
  exportBootstrapSeed: () => Promise<BootstrapSeedExportResult>;
  importBootstrapSeed: (seedString: string) => Promise<BootstrapSeedImportResult>;
  checkRestoreAvailable: () => Promise<RestoreAvailability>;
  pullRestore: () => Promise<PullRestoreResult>;
  /** Get the current config stamp (timestamp + monotonic revision). */
  getConfigStamp: () => Promise<ConfigStamp>;
  /** Stamp-checked write: update the main-VM designate only if the config is
   *  not stale relative to `knownStamp`. Returns `StaleConfigResult` on conflict. */
  stampCheckedSetMainVm: (environmentId: string, knownStamp: ConfigStamp) => Promise<StampCheckedWriteResult>;
  /** Force-write the main-VM designate regardless of staleness (last-write-wins with explicit consent). */
  forceSetMainVm: (environmentId: string) => Promise<ConfigStamp>;
}

// ── Platform detection ─────────────────────────────────────────────────

export type PlatformType = "github" | "ado" | "unknown";

export interface DetectPlatformParams {
  environmentId: string;
  projectId?: string;
  /** Working directory of the project on the VM (where `git remote -v` runs). */
  directory?: string;
  /** Force re-detection even if a cached result exists. */
  force?: boolean;
}

export interface PlatformDetectionResult {
  platform: PlatformType;
  /** The remote URLs that were classified (empty if detection failed). */
  remotes: string[];
  /** Whether the result came from cache. */
  cached: boolean;
}

// ── Infra assistant ──────────────────────────────────────────────────

export type InfraAction = "machine-status" | "clone-repo" | "create-issue" | "detect-platform" | "list-issues" | "add-label" | "edit-issue";

export interface CreateIssueParams {
  title: string;
  body: string;
  labels?: string[];
  /** GitHub repo in "owner/repo" format. Defaults to the current repository if available. */
  repo?: string;
}

export interface CreateIssueResult {
  platform: "github" | "ado";
  url: string;
  number?: number;
}

export interface ListIssuesParams {
  /** Filter by label (GitHub). Multiple labels comma-separated. */
  labels?: string;
  /** Filter by state: "open" (default), "closed", "all". */
  state?: "open" | "closed" | "all";
  /** GitHub repo in "owner/repo" format. Defaults to the current repository if available. */
  repo?: string;
  /** Maximum number of issues to return (default 20). */
  limit?: number;
}

export interface IssueCard {
  number: number;
  title: string;
  url: string;
  labels: string[];
  state: "open" | "closed";
  createdAt: string;
  updatedAt: string;
}

export interface ListIssuesResult {
  platform: "github" | "ado";
  issues: IssueCard[];
  total: number;
  truncated: boolean;
}

export interface MachineStatusEntry {
  id: string;
  name: string;
  health: string;
  endpoints: Array<{ url: string; kind: string }>;
}

export interface AddLabelParams {
  /** Issue number on the platform. */
  issueNumber: number;
  /** Label(s) to apply. */
  labels: string[];
  /** GitHub repo in "owner/repo" format. Defaults to the current repository if available. */
  repo?: string;
}

export interface AddLabelResult {
  issueNumber: number;
  labels: string[];
}

export interface EditIssueParams {
  /** Issue number on the platform. */
  issueNumber: number;
  /** New title. Omit to keep the current title. */
  title?: string;
  /** New body/description. Omit to keep the current body. */
  body?: string;
  /** Labels to ADD (appended to existing). */
  addLabels?: string[];
  /** Labels to REMOVE from the issue. */
  removeLabels?: string[];
  /** GitHub repo in "owner/repo" format. Defaults to the current repository if available. */
  repo?: string;
}

export interface EditIssueResult {
  platform: "github" | "ado";
  issueNumber: number;
  /** Fields that were actually changed. */
  changes: {
    title?: boolean;
    body?: boolean;
    labelsAdded?: string[];
    labelsRemoved?: string[];
  };
}

export interface InfraActionArgs {
  action: InfraAction;
  params?: Record<string, unknown>;
}

export interface InfraActionResult {
  ok: boolean;
  data?: unknown;
  error?: string | I18nMessage;
}

export interface InfraBridge {
  executeAction: (args: InfraActionArgs) => Promise<InfraActionResult>;
  getStatus: () => Promise<{ mainVmId: string | null; connected: boolean }>;
  getPlatform: (environmentId: string, projectId: string) => Promise<PlatformType>;
}

// ── Connection supervisor ─────────────────────────────────────────────

export type ConnectionPhase =
  | "offline"
  | "connecting"
  | "connected"
  | "backoff"
  | "blocked";

export interface ConnectionStatus {
  phase: ConnectionPhase;
  lastError: string | I18nMessage | null;
  errorClass: "transient" | "blocking" | null;
  failureCount: number;
  backoffMs: number;
  lastConnectedAt: number | null;
}

export interface EndpointHealth {
  endpointId: string;
  phase: ConnectionPhase;
  lastError: string | I18nMessage | null;
  failureCount: number;
}

// ── Tailscale peer discovery ────────────────────────────────────────

export interface TailscalePeer {
  hostName: string;
  dnsName: string;
  tailscaleIPs: string[];
  online: boolean;
  os: string;
}

export interface TailscalePeersResponse {
  available: boolean;
  peers: TailscalePeer[];
  error?: string;
}

// ── OpenCode server per-environment ──────────────────────────────────

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

// ── Add-VM wizard ───────────────────────────────────────────────────

export type ReachMethod = "local" | "ssh";

export interface VmWizardStartOptions {
  target: string;
  name?: string;
  reachMethod?: ReachMethod;
  directUrl?: string;
  agentRuntime: AgentRuntime;
  sshKeyPassphrase?: string;
}

export type VmWizardStep =
  | "idle"
  | "pick-reach-method"
  | "pick-target"
  | "probing"
  | "host-key-verify"
  | "pick-services"
  | "runtime-provision"
  | "runtime-consent"
  | "installing"
  | "forwarding"
  | "pairing"
  | "consent"
  | "loop-task-consent"
  | "done"
  | "error";

export type VmWizardServiceStatus = "pending" | "skipped" | "already-running" | "installing" | "installed" | "started" | "failed";

export interface VmWizardServiceSelection {
  /**
   * Per-tool install selections, keyed by tool id (e.g. "gh", "docker").
   * See TOOL_DEFINITIONS in tool-definitions.ts for the canonical list.
   */
  installTools: Record<string, boolean>;
}

export interface SshHost {
  host: string;
  hostName: string;
  user: string;
  port: number;
  identityFile?: string;
  label: string;
}

export interface VmWizardProbeResult {
  reachable: boolean;
  authOk: boolean;
  nodeFound: boolean;
  nodeVersion: string | null;
  loopTaskFound: boolean;
  daemonRunning: boolean;
  daemonPort: number | null;
  opencodeRunning: boolean;
  opencodePort: number | null;
  /** Per-tool detection (true if already installed on the VM), keyed by tool id */
  installedTools: Record<string, boolean>;
  errorDetail: I18nMessage | null;
}

export interface VmWizardLaunchResult {
  started: boolean;
  daemonPort: number | null;
  opencodePort: number | null;
  errorDetail: I18nMessage | null;
  logTail: string | null;
  /** Mandatory service — always installed */
  loopTaskStatus: VmWizardServiceStatus;
  /** Per-tool install status, keyed by tool id (e.g. "gh", "docker") */
  toolStatuses: Record<string, VmWizardServiceStatus>;
}

export interface VmWizardTunnelResult {
  forwarded: boolean;
  localPort: number | null;
  errorDetail: I18nMessage | null;
}

export interface VmWizardPairResult {
  paired: boolean;
  pairingCode: string | null;
  errorDetail: I18nMessage | null;
}

export interface VmWizardProgress {
  step: VmWizardStep;
  message: I18nMessage;
  reachMethod?: ReachMethod | null;
  probe?: VmWizardProbeResult | null;
  launch?: VmWizardLaunchResult | null;
  tunnel?: VmWizardTunnelResult | null;
  pair?: VmWizardPairResult | null;
  consentPrompt?: I18nMessage | null;
  serviceSelection?: VmWizardServiceSelection | null;
  /** Host key fingerprint for user verification (shown on host-key-verify step). */
  hostKeyFingerprint?: string | null;
  /** The raw known_hosts line to write if the user accepts the key. */
  hostKeyLine?: string | null;
}

export interface VmWizardResult {
  environmentId: string;
  environmentName: string;
  daemonUrl: string;
}

export interface VmWizardBridge {
  listSshHosts: () => Promise<SshHost[]>;
  startWizard: (options: VmWizardStartOptions) => Promise<VmWizardResult>;
  onProgress: (cb: (progress: VmWizardProgress) => void) => () => void;
  cancelWizard: () => void;
  respondConsent: (decision: "install" | "skip") => void;
  respondServiceSelection: (selection: VmWizardServiceSelection) => void;
  respondRuntimeConsent: (decision: "install" | "skip") => void;
  respondHostKey: (accepted: boolean) => void;
}

// ── Conversational inbox ────────────────────────────────────────────

export type InboxItemKind =
  | "breach"
  | "failed-loop"
  | "finished-loop"
  | "pending-approval"
  | "awaiting-input"
  | "instance-offline"
  | "prolonged-offline"
  | "digest";

/** Broad notification category that groups item kinds for visual treatment. */
export type NotificationType = "failure" | "finished" | "watch" | "digest";

/** Map each InboxItemKind to its broad NotificationType. */
export function kindToNotificationType(kind: InboxItemKind): NotificationType {
  switch (kind) {
    case "failed-loop":
    case "instance-offline":
    case "prolonged-offline":
      return "failure";
    case "finished-loop":
      return "finished";
    case "breach":
    case "pending-approval":
    case "awaiting-input":
      return "watch";
    case "digest":
      return "digest";
  }
}

/** Inline actions that can be performed on an inbox item without leaving the inbox. */
export type InboxAction =
  | "run-now"
  | "pause"
  | "resume"
  | "restart"
  | "dismiss"
  | "open-in-chat";

export interface InboxItem {
  id: string;
  kind: InboxItemKind;
  /** Broad notification category for icon/color treatment. */
  notificationType: NotificationType;
  environmentId: string;
  environmentName: string;
  /** Loop ID when the item refers to a specific loop. */
  loopId?: string;
  /** Human-readable description of the item. */
  title: string;
  /** Short secondary detail (e.g. "5/10 runs", "exit 1"). */
  detail?: string;
  /** ISO timestamp when the item was created or last updated. */
  occurredAt: string;
  /** For prolonged-offline items: when the outage began. */
  outageSince?: string;
  /** Whether the user has dismissed / acknowledged the item. */
  dismissed: boolean;
  /** Actions available for this item, derived from its kind and loop status. */
  availableActions: InboxAction[];
  /** Project ID for the item's loop (used to scope "Open in chat"). */
  projectId?: string;
}

export type InboxItemResolutionReason =
  | "loop-recovered"
  | "breach-cleared"
  | "instance-online"
  | "outage-resolved"
  | "watch-cleared";

export interface ResolvedInboxItem {
  /** The original inbox item data at the time of resolution. */
  item: InboxItem;
  /** ISO timestamp when the item was auto-resolved. */
  resolvedAt: string;
  /** Machine-readable reason the item resolved. */
  resolution: InboxItemResolutionReason;
}

export interface InboxQueryResult {
  /** Markdown-formatted answer. */
  answer: string;
  /** Items referenced in the answer (for click-through navigation). */
  references: InboxItem[];
}

export interface InboxBridge {
  getItems: () => Promise<InboxItem[]>;
  dismissItem: (itemId: string) => Promise<void>;
  queryFleet: (question: string) => Promise<InboxQueryResult>;
  /** Persist a resolved item to the Done archive. */
  resolveItem: (resolved: ResolvedInboxItem) => Promise<void>;
  /** Get all resolved items (within retention window). */
  getResolvedItems: () => Promise<ResolvedInboxItem[]>;
  /** Prune resolved items older than 30 days. */
  pruneResolvedItems: () => Promise<void>;
}

// ── Reachability (instance health layer, separate from loop status) ───

/**
 * Instance reachability state, derived from tunnel + API health.
 * NEVER derived from loop exit codes.
 *
 * - "connected": the daemon API is reachable and responding.
 * - "reconnecting": tunnel/API is temporarily lost, auto-reconnect in progress.
 * - "unreachable": no path to the daemon (offline, blocked, or tunnel down).
 */
export type ReachabilityState = "connected" | "reconnecting" | "unreachable";

/** Timestamped reachability snapshot for an environment. */
export interface ReachabilityStatus {
  environmentId: string;
  state: ReachabilityState;
  /** ISO timestamp of the last state transition. */
  changedAt: string;
}

export interface ReachabilityBridge {
  /** Get current reachability for a single environment. */
  getStatus: (environmentId: string) => Promise<ReachabilityStatus | null>;
  /** Get current reachability for all environments. */
  getAll: () => Promise<ReachabilityStatus[]>;
  /** Subscribe to reachability state changes. */
  onStatusChange: (cb: (status: ReachabilityStatus) => void) => () => void;
}

// ── Prolonged-outage escalation ────────────────────────────────────

export interface OutageEscalation {
  environmentId: string;
  /** ISO timestamp when the outage began. */
  since: string;
  /** Elapsed ms since the outage began (at time of escalation). */
  durationMs: number;
}

export interface OutageBridge {
  /** Subscribe to outage escalations (prolonged unreachability). */
  onEscalation: (cb: (event: OutageEscalation) => void) => () => void;
  /** Subscribe to outage self-resolutions (reconnect after escalation). */
  onResolve: (cb: (environmentId: string) => void) => () => void;
  /** Get current active escalated outages. */
  getEscalations: () => Promise<OutageEscalation[]>;
}

// ── Budget watch ────────────────────────────────────────────────────

export interface BudgetWatch {
  id: string;
  scope: "loop" | "fleet";
  /** Required when scope = "loop" — which loop to watch. */
  loopId?: string;
  /** Required when scope = "loop" — which environment the loop belongs to. */
  environmentId?: string;
  /** Max runs per day before the watch triggers. */
  threshold: number;
  /** Opt-in auto-pause on breach. Never default. */
  autoPause: boolean;
  /** Can be toggled off without deleting. */
  enabled: boolean;
  createdAt: string;
}

export interface BudgetBreach {
  id: string;
  watchId: string;
  loopId: string;
  environmentId: string;
  environmentName: string;
  loopDescription: string;
  runsToday: number;
  threshold: number;
  autoPaused: boolean;
  breachedAt: string;
  dismissed: boolean;
}

export interface BudgetBridge {
  getWatches: () => Promise<BudgetWatch[]>;
  addWatch: (watch: Omit<BudgetWatch, "id" | "createdAt">) => Promise<BudgetWatch>;
  removeWatch: (watchId: string) => Promise<void>;
  updateWatch: (watchId: string, updates: Partial<Pick<BudgetWatch, "threshold" | "autoPause" | "enabled">>) => Promise<void>;
  getBreaches: () => Promise<BudgetBreach[]>;
  addBreach: (breach: Omit<BudgetBreach, "id">) => Promise<BudgetBreach>;
  dismissBreach: (breachId: string) => Promise<void>;
}

// ── Condition watch (ping-me-when) ────────────────────────────────────

/** Conditions Orbion can actually observe. The agent must decline others. */
export type WatchConditionKind =
  | "status-transition"
  | "reachability-change";

/** Target for a watch: which loop/instance to monitor. */
export type WatchTarget =
  | { kind: "loop"; loopId: string; environmentId: string }
  | { kind: "instance"; environmentId: string };

export interface WatchCondition {
  kind: WatchConditionKind;
  targetStatus?: string;
  description: string;
}

export interface ConditionWatch {
  id: string;
  target: WatchTarget;
  condition: WatchCondition;
  tripped: boolean;
  createdAt: string;
  trippedAt: string | null;
}

export interface ConditionWatchBridge {
  getWatches: () => Promise<ConditionWatch[]>;
  addWatch: (watch: Omit<ConditionWatch, "id" | "createdAt" | "tripped" | "trippedAt">) => Promise<ConditionWatch>;
  removeWatch: (watchId: string) => Promise<void>;
  tripWatch: (watchId: string) => Promise<void>;
}

// ── Chat sessions ────────────────────────────────────────────────────

/** A persisted chat session, filed under a project in the sidebar. */
export interface ChatSession {
  id: string;
  title: string;
  /** Project this session is filed under (project name, matching sidebar merge key). */
  projectName: string;
  /** The environment (instance) this session is homed to. */
  environmentId: string;
  /** The project's working directory on the home instance (derived from loops' cwd at creation). */
  workingDirectory: string;
  /** The agent runtime currently active for this session. Defaults to the environment's agentRuntime. */
  activeRuntime: AgentRuntime;
  /** The model ID currently selected for this session (e.g. "openai/gpt-4o"). Undefined means use runtime default. */
  activeModel?: string;
  /** The reasoning effort level for this session. Undefined means use model default. */
  reasoningEffort?: ReasoningEffort;
  /** ISO timestamp of last activity in this session. */
  lastActiveAt: string;
  /** ISO timestamp when the session was created. */
  createdAt: string;
}

// ── Transcript persistence (local, instance-independent) ────────────

/** A persisted tool-call record within a transcript message. */
export interface ToolCallRecord {
  id: string;
  kind: string;
  title: string;
  status: "running" | "completed" | "error";
  output?: string;
  startedAt: number;
  finishedAt?: number;
}

/** A single persisted message in a chat transcript. */
export interface TranscriptMessage {
  id: string;
  /** The ChatSession this message belongs to. */
  sessionId: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCallRecord[];
  startedAt: number;
  finishedAt?: number;
  /** ISO timestamp when this message was first persisted. */
  createdAt: string;
}

export interface TranscriptBridge {
  /** Get all messages for a session, ordered by createdAt. */
  getMessages: (sessionId: string) => Promise<TranscriptMessage[]>;
  /** Append a single message to a session. */
  appendMessage: (message: Omit<TranscriptMessage, "createdAt">) => Promise<TranscriptMessage>;
  /** Append multiple messages atomically (for initial replay). */
  appendMessages: (messages: Array<Omit<TranscriptMessage, "createdAt">>) => Promise<TranscriptMessage[]>;
  /** Update a specific message (for streaming content or status changes). */
  updateMessage: (messageId: string, updates: Partial<Pick<TranscriptMessage, "content" | "toolCalls" | "finishedAt">>) => Promise<void>;
  /** Delete all messages for a session. */
  deleteSession: (sessionId: string) => Promise<void>;
}

// ── Native OS notifications ─────────────────────────────────────────

export type DeepLinkTarget =
  | { kind: "loop"; environmentId: string; loopId: string }
  | { kind: "instance"; environmentId: string }
  | { kind: "inbox-item"; environmentId: string; itemKind: InboxItemKind; itemId: string };

export interface NotificationSendArgs {
  title: string;
  body: string;
  /** Tag prevents duplicate notifications for the same event. */
  tag?: string;
  /** Deep-link target: clicking the notification navigates here. */
  deepLink?: DeepLinkTarget;
  /** If true, skip the notification when the window is focused. */
  suppressIfFocused?: boolean;
}

export interface NotificationBridge {
  send: (args: NotificationSendArgs) => Promise<void>;
  setMuted: (muted: boolean) => Promise<void>;
  isMuted: () => Promise<boolean>;
  onClick: (cb: (deepLink: DeepLinkTarget) => void) => () => void;
}

// ── MCP (loop-task daemon MCP server) ───────────────────────────────

/**
 * An MCP tool advertised by a loop-task daemon's MCP server.
 * Tool names are discovered at runtime — never hard-coded or invented.
 */
export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

/**
 * Result of an MCP tool call routed through the main process.
 * On success, `data` contains the tool's return value.
 * On failure, `error` contains a human-readable message surfaced in chat.
 */
export interface McpToolCallResult {
  ok: boolean;
  data?: unknown;
  error?: string | I18nMessage;
}

/**
 * Connection state for an environment's MCP server endpoint.
 * - "connected": tools are available and callable.
 * - "connecting": handshake / tool discovery in progress.
 * - "unreachable": MCP server not responding.
 * - "error": MCP server responded with an error (details in lastError).
 */
export type McpConnectionState = "connected" | "connecting" | "unreachable" | "error";

export interface McpConnectionStatus {
  environmentId: string;
  state: McpConnectionState;
  tools: McpToolInfo[];
  lastError: string | I18nMessage | null;
  connectedAt: number | null;
}

export interface McpBridge {
  /** Get the MCP connection status for an environment. */
  getStatus: (environmentId: string) => Promise<McpConnectionStatus>;
  /** Connect (or reconnect) the MCP client to an environment's daemon. */
  connect: (environmentId: string) => Promise<McpConnectionStatus>;
  /** Disconnect an environment's MCP client. */
  disconnect: (environmentId: string) => Promise<void>;
  /** Call an MCP tool on an environment's daemon. Tool name must come from getStatus().tools. */
  callTool: (environmentId: string, toolName: string, args: Record<string, unknown>) => Promise<McpToolCallResult>;
  /** Subscribe to MCP connection status changes. */
  onStatusChange: (cb: (status: McpConnectionStatus) => void) => () => void;
}

// ── Agent streaming (OpenCode runtime) ────────────────────────────────

/** Arguments for sending a prompt to the agent runtime. */
export interface AgentSendPromptArgs {
  environmentId: string;
  prompt: string;
  /** OpenCode session ID (if resuming an existing session). */
  sessionId?: string;
  /** The Orbion chat session ID for correlating stream events. */
  chatSessionId: string;
  /** The Orbion turn ID for correlating stream events. */
  turnId: string;
  /** The model to use for this prompt (e.g. "openai/gpt-4o"). */
  model?: string;
  /** The reasoning effort level for this prompt. */
  reasoningEffort?: ReasoningEffort;
}

/** A single streaming event from the agent runtime. */
export type AgentStreamEvent =
  | { kind: "text-delta"; chatSessionId: string; turnId: string; text: string }
  | { kind: "tool-call-start"; chatSessionId: string; turnId: string; toolCallId: string; toolName: string; title: string }
  | { kind: "tool-call-output"; chatSessionId: string; turnId: string; toolCallId: string; output: string; status: "completed" | "error" }
  | { kind: "turn-finished"; chatSessionId: string; turnId: string }
  | { kind: "turn-error"; chatSessionId: string; turnId: string; error: string }
  | { kind: "turn-interrupted"; chatSessionId: string; turnId: string };

/** Result of sending a prompt to the agent. */
export interface AgentSendPromptResult {
  ok: boolean;
  /** The OpenCode session ID that processed the prompt. */
  sessionId?: string;
  error?: string | I18nMessage;
}

export interface AgentBridge {
  /** Send a prompt to the agent and begin streaming events. */
  sendPrompt: (args: AgentSendPromptArgs) => Promise<AgentSendPromptResult>;
  /** Interrupt/abort an in-flight agent generation. Partial output is kept. */
  interrupt: (environmentId: string, sessionId?: string) => Promise<void>;
  /** Subscribe to agent streaming events. */
  onStreamEvent: (cb: (event: AgentStreamEvent) => void) => () => void;
  /** List available models from the runtime adapter for an environment. */
  listModels: (environmentId: string) => Promise<ListModelsResult>;
}

// ── Full IPC bridge ─────────────────────────────────────────────────

export interface ConnectionBridge {
  getStatus: (environmentId: string) => Promise<ConnectionStatus | null>;
  getEndpointHealth: (environmentId: string) => Promise<EndpointHealth[]>;
  retry: (environmentId: string) => Promise<void>;
  onStatusChange: (cb: (environmentId: string, status: ConnectionStatus) => void) => () => void;
  onEndpointHealthChange: (cb: (environmentId: string, health: EndpointHealth[]) => void) => () => void;
  notifyNetworkChanged: (online: boolean) => void;
}

export interface OpenCodeBridge {
  getStatus: (environmentId: string) => Promise<OpenCodeConnectionStatus>;
  refreshStatus: (environmentId: string) => Promise<OpenCodeConnectionStatus>;
  onStatusChange: (cb: (environmentId: string, status: OpenCodeConnectionStatus) => void) => () => void;
}

export interface LoopTaskBridge {
  request: <T = unknown>(args: ApiRequestArgs) => Promise<ApiResponse<T>>;
  subscribeStream: (args: StreamSubscribeArgs) => Promise<void>;
  unsubscribeStream: (subId: string) => Promise<void>;
  onStreamEvent: (cb: (payload: StreamEventPayload) => void) => () => void;
  config: ConfigBridge;
  connection: ConnectionBridge;
  opencode: OpenCodeBridge;
  tailscalePeers: () => Promise<TailscalePeersResponse>;
  vmWizard: VmWizardBridge;
  infra: InfraBridge;
  budget: BudgetBridge;
  inbox: InboxBridge;
  watch: ConditionWatchBridge;
  notification: NotificationBridge;
  outage: OutageBridge;
  reachability: ReachabilityBridge;
  transcript: TranscriptBridge;
  mcp: McpBridge;
  agent: AgentBridge;
}
