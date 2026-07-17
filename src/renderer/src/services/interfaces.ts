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
  InboxQueryResult,
  ResolvedInboxItem,
  InboxItemResolutionReason,
  ConditionWatch,
  DeepLinkTarget,
  NotificationSendArgs,
  OutageEscalation,
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
  startWizard(target: string, name?: string): Promise<VmWizardResult>;
  onProgress(cb: (progress: VmWizardProgress) => void): () => void;
  cancelWizard(): void;
  respondConsent(decision: "install" | "skip"): void;
  respondServiceSelection(selection: VmWizardServiceSelection): void;
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
