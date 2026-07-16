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
} from "../../../shared/ipc";

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
  sendNotification(opts: {
    environmentId: string;
    environmentName: string;
    itemId: string;
    itemType: string;
    status: string;
    message: string;
  }): void;
  setMuted(environmentId: string, muted: boolean): void;
}
