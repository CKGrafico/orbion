import type { LogEntry } from "./log.js";
// All HTTP to loop-task environments runs in the MAIN process: the loop-task
// daemon sends no CORS headers, so renderer fetch would be blocked.

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

export type PlatformType = "github" | "ado" | "unknown";

export interface DetectPlatformParams {
  environmentId: string;
  projectId?: string;
  directory?: string;
  force?: boolean;
}

export interface PlatformDetectionResult {
  platform: PlatformType;
  remotes: string[];
  cached: boolean;
}

export type InfraAction = "machine-status" | "clone-repo" | "create-issue" | "detect-platform" | "list-issues" | "add-label" | "edit-issue" | "bulk-relabel" | "list-prs-awaiting-review" | "get-pr-verdict" | "get-pr-diff" | "get-pr-briefing" | "submit-pr-review" | "open-pr-in-browser";

export interface CreateIssueParams {
  title: string;
  body: string;
  labels?: string[];
  repo?: string;
}

export interface CreateIssueResult {
  platform: "github" | "ado";
  url: string;
  number?: number;
}

export interface ListIssuesParams {
  labels?: string;
  state?: "open" | "closed" | "all";
  repo?: string;
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
  issueNumber: number;
  labels: string[];
  repo?: string;
}

export interface AddLabelResult {
  issueNumber: number;
  labels: string[];
}

export interface EditIssueParams {
  issueNumber: number;
  title?: string;
  body?: string;
  addLabels?: string[];
  removeLabels?: string[];
  repo?: string;
}

export interface EditIssueResult {
  platform: "github" | "ado";
  issueNumber: number;
  changes: {
    title?: boolean;
    body?: boolean;
    labelsAdded?: string[];
    labelsRemoved?: string[];
  };
}

export interface BulkRelabelParams {
  issueNumbers: number[];
  addLabels: string[];
  removeLabels?: string[];
  repo?: string;
}

export interface BulkRelabelItemResult {
  issueNumber: number;
  ok: boolean;
  error?: string;
}

export interface BulkRelabelResult {
  items: BulkRelabelItemResult[];
  succeeded: number;
  failed: number;
}

export interface PrAwaitingReviewItem {
  number: number;
  title: string;
  repo: string;
  author: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  /** Used for verdict cache invalidation. */
  headSha: string;
}

export type PrRiskLevel = "low" | "medium" | "high" | "uncertain";

export interface PrVerdict {
  verdict: string;
  riskLevel: PrRiskLevel;
}

export interface ReviewModeItem {
  repo: string;
  number: number;
  title: string;
  author: string;
  url: string;
  headSha: string;
  verdict?: PrVerdict;
}

export interface GetPrVerdictParams {
  repo: string;
  number: number;
}

export interface GetPrVerdictResult {
  verdict: PrVerdict;
}

export interface DiffFileEntry {
  path: string;
  additions: number;
  deletions: number;
  isBinary: boolean;
}

export interface GetPrDiffParams {
  repo: string;
  number: number;
  path?: string;
}

export interface GetPrDiffResult {
  diff: string;
  files: DiffFileEntry[];
  truncated: boolean;
}

export interface BriefingFileGroup {
  label: string;
  additions: number;
  deletions: number;
  files: DiffFileEntry[];
}

export interface BriefingSection {
  kind: "flagged" | "boilerplate";
  title: string;
  files: DiffFileEntry[];
  group?: BriefingFileGroup;
}

export interface GetPrBriefingParams {
  repo: string;
  number: number;
}

export interface GetPrBriefingResult {
  sections: BriefingSection[];
  summary: string;
  totalFlagged: number;
  totalBoilerplate: number;
}

export interface ListPrsAwaitingReviewParams {
  repo?: string;
  limit?: number;
}

export interface ListPrsAwaitingReviewResult {
  platform: "github";
  prs: PrAwaitingReviewItem[];
  total: number;
  truncated: boolean;
}

export type PrReviewEvent = "APPROVE" | "REQUEST_CHANGES";

export interface SubmitPrReviewParams {
  repo: string;
  number: number;
  event: PrReviewEvent;
  body?: string;
}

export interface SubmitPrReviewResult {
  platform: "github" | "ado";
  number: number;
  event: PrReviewEvent;
}

export interface OpenPrInBrowserParams {
  url: string;
}

export type OverlapKind = "conflict" | "duplicate" | "touching";

export interface PrOverlap {
  prA: string;
  prB: string;
  kind: OverlapKind;
  sharedFiles: string[];
  note: string;
}

export interface ReviewOrderEntry {
  prKey: string;
  number: number;
  reason: string;
}

export interface BatchOverlapResult {
  overlaps: PrOverlap[];
  suggestedOrder: ReviewOrderEntry[];
  perPrNotes: Map<string, string[]>;
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
  /** Per-tool install selections, keyed by tool id. See TOOL_DEFINITIONS in tool-definitions.ts. */
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
  installedTools: Record<string, boolean>;
  errorDetail: I18nMessage | null;
}

export interface VmWizardLaunchResult {
  started: boolean;
  daemonPort: number | null;
  opencodePort: number | null;
  errorDetail: I18nMessage | null;
  logTail: string | null;
  loopTaskStatus: VmWizardServiceStatus;
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
  hostKeyFingerprint?: string | null;
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

export type InboxItemKind =
  | "breach"
  | "failed-loop"
  | "finished-loop"
  | "pending-approval"
  | "awaiting-input"
  | "instance-offline"
  | "prolonged-offline"
  | "pr-awaiting-review"
  | "digest";

export type NotificationType = "failure" | "finished" | "watch" | "digest";

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
    case "pr-awaiting-review":
      return "watch";
    case "digest":
      return "digest";
  }
}

export type InboxAction =
  | "run-now"
  | "pause"
  | "resume"
  | "restart"
  | "dismiss"
  | "open-in-chat";

export interface DigestCounts {
  safe: number;
  needsYou: number;
  conflict: number;
  total: number;
}

export interface InboxItem {
  id: string;
  kind: InboxItemKind;
  notificationType: NotificationType;
  environmentId: string;
  environmentName: string;
  loopId?: string;
  title: string;
  detail?: string;
  occurredAt: string;
  outageSince?: string;
  dismissed: boolean;
  availableActions: InboxAction[];
  projectId?: string;
  prNumber?: number;
  prRepo?: string;
  prAuthor?: string;
  prUrl?: string;
  prVerdict?: PrVerdict;
  childItemIds?: string[];
  digestCounts?: DigestCounts;
}

export type InboxItemResolutionReason =
  | "loop-recovered"
  | "breach-cleared"
  | "instance-online"
  | "outage-resolved"
  | "watch-cleared"
  | "pr-resolved";

export interface ResolvedInboxItem {
  item: InboxItem;
  resolvedAt: string;
  resolution: InboxItemResolutionReason;
}

export interface InboxQueryResult {
  answer: string;
  references: InboxItem[];
}

export interface InboxBridge {
  getItems: () => Promise<InboxItem[]>;
  dismissItem: (itemId: string) => Promise<void>;
  queryFleet: (question: string) => Promise<InboxQueryResult>;
  resolveItem: (resolved: ResolvedInboxItem) => Promise<void>;
  getResolvedItems: () => Promise<ResolvedInboxItem[]>;
  pruneResolvedItems: () => Promise<void>;
}

/**
 * Instance reachability state, derived from tunnel + API health.
 * NEVER derived from loop exit codes.
 */
export type ReachabilityState = "connected" | "reconnecting" | "unreachable";

export interface ReachabilityStatus {
  environmentId: string;
  state: ReachabilityState;
  changedAt: string;
}

export interface ReachabilityBridge {
  getStatus: (environmentId: string) => Promise<ReachabilityStatus | null>;
  getAll: () => Promise<ReachabilityStatus[]>;
  onStatusChange: (cb: (status: ReachabilityStatus) => void) => () => void;
}

export interface OutageEscalation {
  environmentId: string;
  since: string;
  durationMs: number;
}

export interface OutageBridge {
  onEscalation: (cb: (event: OutageEscalation) => void) => () => void;
  onResolve: (cb: (environmentId: string) => void) => () => void;
  getEscalations: () => Promise<OutageEscalation[]>;
}

export interface BudgetWatch {
  id: string;
  scope: "loop" | "fleet";
  loopId?: string;
  environmentId?: string;
  threshold: number;
  autoPause: boolean;
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

export type WatchConditionKind =
  | "status-transition"
  | "reachability-change";

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

/** Ephemeral by default (persisted = false). Setting persisted = true makes the session a durable sidebar entry. */
export interface ChatSession {
  id: string;
  title: string;
  projectName: string;
  environmentId: string;
  workingDirectory: string;
  activeRuntime: AgentRuntime;
  activeModel?: string;
  reasoningEffort?: ReasoningEffort;
  persisted?: boolean;
  turnCount?: number;
  /** ISO timestamp until which auto-persist offers are suppressed.
   *  When the user declines, this silences offers until reset. */
  declineAutoPersistUntil?: string;
  pinned?: boolean;
  isLoopChat?: boolean;
  loopId?: string;
  sortOrder?: number;
  lastActiveAt: string;
  createdAt: string;
}

export interface SweepEphemeralSessionsArgs {
  activeSessionId: string | null;
  inactivityThresholdHours: number;
}

export interface SweepEphemeralSessionsResult {
  removedSessionIds: string[];
}

export interface ToolCallRecord {
  id: string;
  kind: string;
  title: string;
  status: "running" | "completed" | "error";
  output?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface TranscriptMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCallRecord[];
  startedAt: number;
  finishedAt?: number;
  createdAt: string;
  environmentId?: string;
}

export interface TranscriptBridge {
  getMessages: (sessionId: string) => Promise<TranscriptMessage[]>;
  appendMessage: (message: Omit<TranscriptMessage, "createdAt">) => Promise<TranscriptMessage>;
  appendMessages: (messages: Array<Omit<TranscriptMessage, "createdAt">>) => Promise<TranscriptMessage[]>;
  updateMessage: (messageId: string, updates: Partial<Pick<TranscriptMessage, "content" | "toolCalls" | "finishedAt">>) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
}

export type DeepLinkTarget =
  | { kind: "loop"; environmentId: string; loopId: string }
  | { kind: "instance"; environmentId: string }
  | { kind: "inbox-item"; environmentId: string; itemKind: InboxItemKind; itemId: string };

export interface NotificationSendArgs {
  title: string;
  body: string;
  /** Tag prevents duplicate notifications for the same event. */
  tag?: string;
  deepLink?: DeepLinkTarget;
  suppressIfFocused?: boolean;
}

export interface NotificationBridge {
  send: (args: NotificationSendArgs) => Promise<void>;
  setMuted: (muted: boolean) => Promise<void>;
  isMuted: () => Promise<boolean>;
  onClick: (cb: (deepLink: DeepLinkTarget) => void) => () => void;
}

/**
 * MCP tool advertised by a loop-task daemon's MCP server.
 * Tool names are discovered at runtime — never hard-coded or invented.
 */
export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpToolCallResult {
  ok: boolean;
  data?: unknown;
  error?: string | I18nMessage;
}

/** - "connected": tools available and callable.
 *  - "connecting": handshake / tool discovery in progress.
 *  - "unreachable": MCP server not responding.
 *  - "error": MCP server responded with an error. */
export type McpConnectionState = "connected" | "connecting" | "unreachable" | "error";

export interface McpConnectionStatus {
  environmentId: string;
  state: McpConnectionState;
  tools: McpToolInfo[];
  lastError: string | I18nMessage | null;
  connectedAt: number | null;
}

export interface McpBridge {
  getStatus: (environmentId: string) => Promise<McpConnectionStatus>;
  connect: (environmentId: string) => Promise<McpConnectionStatus>;
  disconnect: (environmentId: string) => Promise<void>;
  /** Tool name must come from getStatus().tools. */
  callTool: (environmentId: string, toolName: string, args: Record<string, unknown>) => Promise<McpToolCallResult>;
  onStatusChange: (cb: (status: McpConnectionStatus) => void) => () => void;
}

export interface AgentSendPromptArgs {
  environmentId: string;
  prompt: string;
  sessionId?: string;
  chatSessionId: string;
  turnId: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
}

export type AgentStreamEvent =
  | { kind: "text-delta"; chatSessionId: string; turnId: string; text: string }
  | { kind: "tool-call-start"; chatSessionId: string; turnId: string; toolCallId: string; toolName: string; title: string }
  | { kind: "tool-call-output"; chatSessionId: string; turnId: string; toolCallId: string; output: string; status: "completed" | "error" }
  | { kind: "turn-finished"; chatSessionId: string; turnId: string }
  | { kind: "turn-error"; chatSessionId: string; turnId: string; error: string }
  | { kind: "turn-interrupted"; chatSessionId: string; turnId: string };

export interface AgentSendPromptResult {
  ok: boolean;
  sessionId?: string;
  error?: string | I18nMessage;
}

export interface AgentBridge {
  sendPrompt: (args: AgentSendPromptArgs) => Promise<AgentSendPromptResult>;
  interrupt: (environmentId: string, sessionId?: string) => Promise<void>;
  onStreamEvent: (cb: (event: AgentStreamEvent) => void) => () => void;
  listModels: (environmentId: string) => Promise<ListModelsResult>;
}

export interface ChainStep {
  taskId: string;
  taskName: string;
  command: string;
  commandArgs: string[];
  onSuccessTaskId: string | null;
  onFailureTaskId: string | null;
}

export interface LoopShape {
  loopId: string;
  environmentId: string;
  command: string;
  commandArgs: string[];
  intervalHuman: string;
  projectId: string | undefined;
  taskId: string | null;
  chainSteps: ChainStep[];
  cachedAt: number;
}

export interface LoopShapeCacheBridge {
  getCached: (environmentId: string) => Promise<LoopShape[]>;
  getAll: () => Promise<LoopShape[]>;
  refresh: (environmentId: string) => Promise<LoopShape[]>;
  onUpdate: (cb: (shapes: LoopShape[]) => void) => () => void;
}

export interface GlobalSettings {
  theme: "dark" | "light" | "system";
  defaultAgentRuntime: AgentRuntime;
  configHomeVmId: string | null;
  ephemeralThresholdHours: number;
}

export interface SettingsBridge {
  getSettings: () => Promise<GlobalSettings>;
  updateSettings: (updates: Partial<GlobalSettings>) => Promise<void>;
}

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

export interface SecurityAuditEvent {
  id: string;
  timestamp: string;
  kind: string;
  environmentId: string;
  credentialKind: "sessionToken" | "sshKeyPassphrase";
  detail?: string;
}

export interface CredentialBridge {
  onTampered: (cb: (event: { environmentId: string; credentialKind: "sessionToken" | "sshKeyPassphrase" }) => void) => () => void;
  getSecurityAuditEvents: () => Promise<SecurityAuditEvent[]>;
}

export interface SiblingDeclineBridge {
  isDeclined: (environmentId: string, loopId: string, fingerprint: string) => Promise<boolean>;
  recordDecline: (record: { environmentId: string; loopId: string; fingerprint: string }) => Promise<void>;
}

export interface LogBridge {
  write: (entry: LogEntry) => void;
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
  loopShapeCache: LoopShapeCacheBridge;
  siblingDecline: SiblingDeclineBridge;
  settings: SettingsBridge;
  log: LogBridge;
  credential: CredentialBridge;
}
