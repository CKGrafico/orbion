  import type {
  Environment,
  AccessEndpoint,
  AgentRuntime,
  EndpointKind,
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
  SweepEphemeralSessionsArgs,
  SweepEphemeralSessionsResult,
  LoopShape,
  PrAwaitingReviewItem,
  PrVerdict,
  ReviewModeItem,
  BatchOverlapResult,
} from "../../../shared/ipc";
import type { LoopMeta, EnvironmentHealth } from "../types";

export interface IConfigService {
  getEnvironments(): Promise<Environment[]>;
  addEnvironment(name: string, url: string, kind?: EndpointKind): Promise<Environment>;
  removeEnvironment(id: string): Promise<void>;
  updateEnvironment(id: string, updates: { name?: string; agentRuntime?: AgentRuntime; sshControlTarget?: string | null }): Promise<void>;
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
  getProjectPipelineLabels(projectId: string): Promise<string[]>;
  setProjectPipelineLabels(projectId: string, labels: string[]): Promise<void>;
  getChatSessions(): Promise<ChatSession[]>;
  addChatSession(session: Omit<ChatSession, "id" | "createdAt">): Promise<ChatSession>;
  removeChatSession(sessionId: string): Promise<void>;
  updateChatSession(sessionId: string, updates: Partial<Pick<ChatSession, "title" | "lastActiveAt" | "projectName" | "environmentId" | "workingDirectory" | "activeRuntime" | "activeModel" | "reasoningEffort" | "persisted" | "turnCount" | "declineAutoPersistUntil" | "pinned">>): Promise<void>;
  pinChatSession(sessionId: string, pinned: boolean): Promise<void>;
  renameChatSession(sessionId: string, title: string): Promise<void>;
  reorderChatSessions(orderedSessionIds: string[]): Promise<void>;
  getExpandedProjects(): Promise<string[]>;
  setExpandedProjects(expandedKeys: string[]): Promise<void>;
  exportBootstrapSeed(): Promise<BootstrapSeedExportResult>;
  importBootstrapSeed(seedString: string): Promise<BootstrapSeedImportResult>;
  checkRestoreAvailable(): Promise<RestoreAvailability>;
  pullRestore(): Promise<PullRestoreResult>;
  getConfigStamp(): Promise<ConfigStamp>;
  stampCheckedSetMainVm(environmentId: string, knownStamp: ConfigStamp): Promise<StampCheckedWriteResult>;
  forceSetMainVm(environmentId: string): Promise<ConfigStamp>;
  sweepEphemeralSessions(args: SweepEphemeralSessionsArgs): Promise<SweepEphemeralSessionsResult>;
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
  getChildItems(digestItem: InboxItem, params: InboxBuildParams): InboxItem[];
  queryFleet(question: string, params: InboxBuildParams): InboxQueryResult;
  resolveItem(resolved: ResolvedInboxItem): Promise<void>;
  getResolvedItems(): Promise<ResolvedInboxItem[]>;
  pruneResolvedItems(): Promise<void>;
  detectAutoResolutions(previousItems: InboxItem[], currentIds: Set<string>, dismissedIds: Set<string>): ResolvedInboxItem[];
  executeInboxAction(item: InboxItem, action: InboxAction): Promise<ApiResponse>;
}

export interface InboxBuildParams {
  perEnvLoops: Record<string, LoopMeta[]>;
  perEnvHealth: Record<string, EnvironmentHealth>;
  environments: Array<{ id: string; name: string }>;
  breaches: BudgetBreach[];
  dismissedIds: Set<string>;
  escalatedOutages: Map<string, OutageEscalation>;
  prAwaitingReview: PrAwaitingReviewItem[];
  mainVmEnvironmentId: string | null;
  mainVmEnvironmentName: string;
  prVerdicts: Map<string, PrVerdict>;
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
  getMessages(sessionId: string): Promise<TranscriptMessage[]>;
  appendMessage(message: Omit<TranscriptMessage, "createdAt">): Promise<TranscriptMessage>;
  appendMessages(messages: Array<Omit<TranscriptMessage, "createdAt">>): Promise<TranscriptMessage[]>;
  updateMessage(messageId: string, updates: Partial<Pick<TranscriptMessage, "content" | "toolCalls" | "finishedAt">>): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
}

export interface IMcpService {
  getStatus(environmentId: string): Promise<McpConnectionStatus>;
  connect(environmentId: string): Promise<McpConnectionStatus>;
  disconnect(environmentId: string): Promise<void>;
  callTool(environmentId: string, toolName: string, args: Record<string, unknown>): Promise<McpToolCallResult>;
  onStatusChange(cb: (status: McpConnectionStatus) => void): () => void;
}

export interface IAgentService {
  sendPrompt(args: AgentSendPromptArgs): Promise<AgentSendPromptResult>;
  interrupt(environmentId: string, sessionId?: string): Promise<void>;
  onStreamEvent(cb: (event: AgentStreamEvent) => void): () => void;
  listModels(environmentId: string): Promise<ListModelsResult>;
}

export interface ILoopShapeCacheService {
  getCached(environmentId: string): Promise<LoopShape[]>;
  getAll(): Promise<LoopShape[]>;
  refresh(environmentId: string): Promise<LoopShape[]>;
  onUpdate(cb: (shapes: LoopShape[]) => void): () => void;
}

export interface ISiblingOfferService {
  isDeclined(environmentId: string, loopId: string, fingerprint: string): Promise<boolean>;
  recordDecline(environmentId: string, loopId: string, fingerprint: string): Promise<void>;
}

export interface IPrPollingService {
  startPolling(): void;
  stopPolling(): void;
  getPrs(): PrAwaitingReviewItem[];
  onPrsUpdate(cb: (prs: PrAwaitingReviewItem[]) => void): () => void;
}

export interface IPrVerdictService {
  getVerdict(repo: string, number: number): PrVerdict | undefined;
  fetchVerdict(repo: string, number: number): Promise<PrVerdict | undefined>;
  syncVerdicts(prs: PrAwaitingReviewItem[]): void;
  onVerdictsUpdate(cb: () => void): () => void;
}

export interface IReviewModeService {
  enter(item: ReviewModeItem): void;
  enterBatch(items: ReviewModeItem[], selectedIndex?: number): void;
  exit(): void;
  getActiveItem(): ReviewModeItem | null;
  getBatchItems(): ReviewModeItem[];
  markDisposed(repo: string, number: number): void;
  getDisposedPrs(): Set<string>;
  submitReview(params: { repo: string; number: number; event: "APPROVE" | "REQUEST_CHANGES"; body?: string }): Promise<{ ok: boolean; error?: string }>;
  openOnWeb(url: string): void;
  onStateChange(cb: (item: ReviewModeItem | null) => void): () => void;
  getOverlapResult(): BatchOverlapResult | null;
  onOverlapUpdate(cb: (result: BatchOverlapResult | null) => void): () => void;
}

export interface ILogService {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}
