// Shared IPC contract between main, preload, and renderer.
// All HTTP to loop-task environments runs in the MAIN process: the loop-task
// daemon sends no CORS headers, so renderer fetch would be blocked — and
// main-process fetch also works unchanged for environments on remote VMs.

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
  error?: string;
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
  error?: string;
}

// ── Config store (electron-store) ───────────────────────────────────

export type EndpointKind = "direct" | "ssh" | "tailscale";

export interface AccessEndpoint {
  id: string;
  kind: EndpointKind;
  url: string;
  lastError: string | null;
  failureCount: number;
}

export type EnvironmentAuthState = "unauthenticated" | "paired" | "blocked" | "unknown";

export interface Environment {
  id: string;
  name: string;
  endpoints: AccessEndpoint[];
  activeEndpointId: string | null;
  authState?: EnvironmentAuthState;
  opencode?: OpenCodeEndpoint | null;
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
  setOpenCodeEndpoint: (environmentId: string, endpoint: OpenCodeEndpoint | null) => Promise<void>;
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
  lastError: string | null;
  errorClass: "transient" | "blocking" | null;
  failureCount: number;
  backoffMs: number;
  lastConnectedAt: number | null;
}

export interface EndpointHealth {
  endpointId: string;
  phase: ConnectionPhase;
  lastError: string | null;
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
  errorMessage: string | null;
  serverVersion: string | null;
  connectedProviders: string[];
  checkedAt: number | null;
}

export interface OpenCodeEndpoint {
  url: string;
  password: string | null;
}

// ── Add-VM wizard ───────────────────────────────────────────────────

export type VmWizardStep =
  | "idle"
  | "pick-target"
  | "probing"
  | "installing"
  | "forwarding"
  | "pairing"
  | "done"
  | "error";

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
  errorDetail: string | null;
}

export interface VmWizardLaunchResult {
  started: boolean;
  daemonPort: number | null;
  opencodePort: number | null;
  errorDetail: string | null;
  logTail: string | null;
}

export interface VmWizardTunnelResult {
  forwarded: boolean;
  localPort: number | null;
  errorDetail: string | null;
}

export interface VmWizardPairResult {
  paired: boolean;
  pairingCode: string | null;
  errorDetail: string | null;
}

export interface VmWizardProgress {
  step: VmWizardStep;
  message: string;
  probe?: VmWizardProbeResult | null;
  launch?: VmWizardLaunchResult | null;
  tunnel?: VmWizardTunnelResult | null;
  pair?: VmWizardPairResult | null;
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
}
