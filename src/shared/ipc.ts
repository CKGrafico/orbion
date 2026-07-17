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

export interface Environment {
  id: string;
  name: string;
  role?: EnvironmentRole;
  endpoints: AccessEndpoint[];
  activeEndpointId: string | null;
  authState?: EnvironmentAuthState;
  opencode?: OpenCodeEndpoint | null;
  infraOpenCode?: OpenCodeEndpoint | null;
}

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

export type VmWizardStep =
  | "idle"
  | "pick-target"
  | "probing"
  | "pick-services"
  | "installing"
  | "forwarding"
  | "pairing"
  | "consent"
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
  probe?: VmWizardProbeResult | null;
  launch?: VmWizardLaunchResult | null;
  tunnel?: VmWizardTunnelResult | null;
  pair?: VmWizardPairResult | null;
  consentPrompt?: I18nMessage | null;
  serviceSelection?: VmWizardServiceSelection | null;
}

export interface VmWizardResult {
  environmentId: string;
  environmentName: string;
  daemonUrl: string;
}

export interface VmWizardBridge {
  listSshHosts: () => Promise<SshHost[]>;
  startWizard: (target: string, name?: string) => Promise<VmWizardResult>;
  onProgress: (cb: (progress: VmWizardProgress) => void) => () => void;
  cancelWizard: () => void;
  respondConsent: (decision: "install" | "skip") => void;
  respondServiceSelection: (selection: VmWizardServiceSelection) => void;
}

// ── Conversational inbox ────────────────────────────────────────────

export type InboxItemKind =
  | "breach"
  | "failed-loop"
  | "pending-approval"
  | "awaiting-input"
  | "instance-offline"
  | "prolonged-offline";

export interface InboxItem {
  id: string;
  kind: InboxItemKind;
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
}

export type InboxItemResolutionReason =
  | "loop-recovered"
  | "breach-cleared"
  | "instance-online"
  | "outage-resolved";

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
}
