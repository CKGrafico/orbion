import type {
  Environment,
  AccessEndpoint,
  EndpointKind,
  SessionScope,
  PairingCodeExchangeResponse,
  OpenCodeEndpoint,
  SetOpenCodeEndpointResult,
  ConnectionStatus,
  EndpointHealth,
  OpenCodeConnectionStatus,
  SshHost,
  VmWizardProgress,
  VmWizardResult,
  VmWizardStartOptions,
  VmWizardServiceSelection,
  TailscalePeersResponse,
  InfraActionArgs,
  InfraActionResult,
  ApiRequestArgs,
  ApiResponse,
  StreamSubscribeArgs,
  StreamEventPayload,
  PlatformType,
  BudgetWatch,
  BudgetBreach,
  InboxItem,
  InboxAction,
  InboxQueryResult,
  ResolvedInboxItem,
  InboxItemResolutionReason,
  ConditionWatch,
  DeepLinkTarget,
  NotificationSendArgs,
  OutageEscalation,
  ReachabilityStatus,
  ChatSession,
  TranscriptMessage,
  McpConnectionStatus,
  McpToolCallResult,
  BootstrapSeedExportResult,
  BootstrapSeedImportResult,
  RestoreAvailability,
  PullRestoreResult,
  AgentSendPromptArgs,
  AgentSendPromptResult,
  AgentStreamEvent,
  ConfigStamp,
  StampCheckedWriteResult,
  ListModelsResult,
} from "../../../shared/ipc";
import type { LoopMeta, EnvironmentHealth } from "../types";

export interface IConfigService {
  getEnvironments(): Promise<Environment[]>;
  addEnvironment(name: string, url: string, kind?: EndpointKind): Promise<Environment>;
  removeEnvironment(id: string): Promise<void>;
  addEndpoint(environmentId: string, url: string, kind: EndpointKind): Promise<AccessEndpoint | null>;
  removeEndpoint(environmentId: string, endpointId: string): Promise<void>;
  setActiveEndpoint(environmentId: string, endpointId: string): Promise<void>;
  getSelectedEnvironmentId(): Promise<string | null>;
  setSelectedEnvironmentId(id: string | null): Promise<void>;
  migrateFromLocalStorage(rawInstances: string, rawSelectedId: string | null): Promise<boolean>;
  exchangePairingCode(baseUrl: string, code: string, scope?: SessionScope): Promise<PairingCodeExchangeResponse>;
  removeSessionToken(environmentId: string): Promise<void>;
  setOpenCodeEndpoint(environmentId: string, endpoint: OpenCodeEndpoint | null): Promise<SetOpenCodeEndpointResult>;
  setMainVm(environmentId: string): Promise<void>;
  getMainVmId(): Promise<string | null>;
  getProjectPickupLabels(projectId: string): Promise<string[]>;
  setProjectPickupLabels(projectId: string, labels: string[]): Promise<void>;
  getChatSessions(): Promise<ChatSession[]>;
  addChatSession(session: Omit<ChatSession, "id" | "createdAt">): Promise<ChatSession>;
  removeChatSession(sessionId: string): Promise<void>;
  updateChatSession(sessionId: string, updates: Partial<Pick<ChatSession, "title" | "lastActiveAt" | "environmentId" | "workingDirectory" | "activeRuntime" | "activeModel" | "reasoningEffort">>): Promise<void>;
  getExpandedProjects(): Promise<string[]>;
  setExpandedProjects(expandedKeys: string[]): Promise<void>;
  exportBootstrapSeed(): Promise<BootstrapSeedExportResult>;
  importBootstrapSeed(seedString: string): Promise<BootstrapSeedImportResult>;
  checkRestoreAvailable(): Promise<RestoreAvailability>;
  pullRestore(): Promise<PullRestoreResult>;
  /** Get the current config stamp (timestamp + monotonic revision). */
  getConfigStamp(): Promise<ConfigStamp>;
  /** Stamp-checked write: update the main-VM designate only if the config is
   *  not stale relative to `knownStamp`. Returns `StaleConfigResult` on conflict. */
  stampCheckedSetMainVm(environmentId: string, knownStamp: ConfigStamp): Promise<StampCheckedWriteResult>;
  /** Force-write the main-VM designate regardless of staleness (last-write-wins with explicit consent). */
  forceSetMainVm(environmentId: string): Promise<ConfigStamp>;
}

export interface IConnectionService {
  getStatus(environmentId: string): Promise<ConnectionStatus | null>;
  getEndpointHealth(environmentId: string): Promise<EndpointHealth[]>;
  retry(environmentId: string): Promise<void>;
  onStatusChange(cb: (environmentId: string, status: ConnectionStatus) => void): () => void;
  onEndpointHealthChange(cb: (environmentId: string, health: EndpointHealth[]) => void): () => void;
  notifyNetworkChanged(online: boolean): void;
}

export interface IOpenCodeService {
  getStatus(environmentId: string): Promise<OpenCodeConnectionStatus>;
  refreshStatus(environmentId: string): Promise<OpenCodeConnectionStatus>;
  onStatusChange(cb: (environmentId: string, status: OpenCodeConnectionStatus) => void): () => void;
}

export interface IVmWizardService {
  listSshHosts(): Promise<SshHost[]>;
  startWizard(options: VmWizardStartOptions): Promise<VmWizardResult>;
  onProgress(cb: (progress: VmWizardProgress) => void): () => void;
  cancelWizard(): void;
  respondConsent(decision: "install" | "skip"): void;
  respondServiceSelection(selection: VmWizardServiceSelection): void;
  respondRuntimeConsent(decision: "install" | "skip"): void;
  respondHostKey(accepted: boolean): void;
}

export interface IInfraService {
  executeAction(args: InfraActionArgs): Promise<InfraActionResult>;
  getStatus(): Promise<{ mainVmId: string | null; connected: boolean }>;
  getPlatform(environmentId: string, projectId: string): Promise<PlatformType>;
}

export interface IApiService {
  request<T = unknown>(args: ApiRequestArgs): Promise<ApiResponse<T>>;
}

export interface IStreamService {
  subscribeStream(args: StreamSubscribeArgs): Promise<void>;
  unsubscribeStream(subId: string): Promise<void>;
  onStreamEvent(cb: (payload: StreamEventPayload) => void): () => void;
}

export interface ITailscaleService {
  getPeers(): Promise<TailscalePeersResponse>;
}

export interface INotificationService {
  send(args: NotificationSendArgs): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  isMuted(): Promise<boolean>;
  onClick(cb: (deepLink: DeepLinkTarget) => void): () => void;
}

export interface IBudgetService {
  getWatches(): Promise<BudgetWatch[]>;
  addWatch(watch: Omit<BudgetWatch, "id" | "createdAt">): Promise<BudgetWatch>;
  removeWatch(watchId: string): Promise<void>;
  updateWatch(watchId: string, updates: Partial<Pick<BudgetWatch, "threshold" | "autoPause" | "enabled">>): Promise<void>;
  getBreaches(): Promise<BudgetBreach[]>;
  addBreach(breach: Omit<BudgetBreach, "id">): Promise<BudgetBreach>;
  dismissBreach(breachId: string): Promise<void>;
  pauseLoop(environmentId: string, loopId: string): Promise<ApiResponse>;
  resumeLoop(environmentId: string, loopId: string): Promise<ApiResponse>;
}

export interface IInboxService {
  getDismissedIds(): Promise<string[]>;
  dismissItem(itemId: string): Promise<void>;
  buildItems(params: InboxBuildParams): InboxItem[];
  queryFleet(question: string, params: InboxBuildParams): InboxQueryResult;
  /** Persist a resolved item to the Done archive. */
  resolveItem(resolved: ResolvedInboxItem): Promise<void>;
  /** Get all resolved items (within retention window). */
  getResolvedItems(): Promise<ResolvedInboxItem[]>;
  /** Prune resolved items older than 30 days. */
  pruneResolvedItems(): Promise<void>;
  /** Detect auto-resolved items by diffing previous and current active sets. Returns newly resolved items. */
  detectAutoResolutions(previousItems: InboxItem[], currentIds: Set<string>, dismissedIds: Set<string>): ResolvedInboxItem[];
  /** Execute an inline action on an inbox item (e.g. pause, run-now, resume). */
  executeInboxAction(item: InboxItem, action: InboxAction): Promise<ApiResponse>;
}

export interface InboxBuildParams {
  perEnvLoops: Record<string, LoopMeta[]>;
  perEnvHealth: Record<string, EnvironmentHealth>;
  environments: Array<{ id: string; name: string }>;
  breaches: BudgetBreach[];
  dismissedIds: Set<string>;
  /** Actively escalated prolonged outages, keyed by environmentId. */
  escalatedOutages: Map<string, OutageEscalation>;
}

export interface IOutageService {
  getEscalations(): Promise<OutageEscalation[]>;
  onEscalation(cb: (event: OutageEscalation) => void): () => void;
  onResolve(cb: (environmentId: string) => void): () => void;
}

export interface IReachabilityService {
  getStatus(environmentId: string): Promise<ReachabilityStatus | null>;
  getAll(): Promise<ReachabilityStatus[]>;
  onStatusChange(cb: (status: ReachabilityStatus) => void): () => void;
}

export interface ITranscriptService {
  /** Get all messages for a session, ordered by createdAt. */
  getMessages(sessionId: string): Promise<TranscriptMessage[]>;
  /** Append a single message to a session. */
  appendMessage(message: Omit<TranscriptMessage, "createdAt">): Promise<TranscriptMessage>;
  /** Append multiple messages atomically. */
  appendMessages(messages: Array<Omit<TranscriptMessage, "createdAt">>): Promise<TranscriptMessage[]>;
  /** Update a specific message. */
  updateMessage(messageId: string, updates: Partial<Pick<TranscriptMessage, "content" | "toolCalls" | "finishedAt">>): Promise<void>;
  /** Delete all messages for a session. */
  deleteSession(sessionId: string): Promise<void>;
}

export interface IMcpService {
  /** Get the MCP connection status for an environment. */
  getStatus(environmentId: string): Promise<McpConnectionStatus>;
  /** Connect (or reconnect) the MCP client to an environment's daemon. */
  connect(environmentId: string): Promise<McpConnectionStatus>;
  /** Disconnect an environment's MCP client. */
  disconnect(environmentId: string): Promise<void>;
  /** Call an MCP tool on an environment's daemon. */
  callTool(environmentId: string, toolName: string, args: Record<string, unknown>): Promise<McpToolCallResult>;
  /** Subscribe to MCP connection status changes. */
  onStatusChange(cb: (status: McpConnectionStatus) => void): () => void;
}

export interface IAgentService {
  /** Send a prompt to the agent and begin streaming events. */
  sendPrompt(args: AgentSendPromptArgs): Promise<AgentSendPromptResult>;
  /** Interrupt/abort an in-flight agent generation. Partial output is kept. */
  interrupt(environmentId: string, sessionId?: string): Promise<void>;
  /** Subscribe to agent streaming events. */
  onStreamEvent(cb: (event: AgentStreamEvent) => void): () => void;
  /** List available models from the runtime adapter for an environment. */
  listModels(environmentId: string): Promise<ListModelsResult>;
}
