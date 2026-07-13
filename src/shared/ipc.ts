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

// ── Config store (electron-store) ───────────────────────────────────

export type EndpointKind = "direct" | "ssh" | "tailscale";

export interface AccessEndpoint {
  id: string;
  kind: EndpointKind;
  url: string;
  lastError: string | null;
  failureCount: number;
}

export interface Environment {
  id: string;
  name: string;
  endpoints: AccessEndpoint[];
  activeEndpointId: string | null;
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

// ── Full IPC bridge ─────────────────────────────────────────────────

export interface ConnectionBridge {
  getStatus: (environmentId: string) => Promise<ConnectionStatus | null>;
  getEndpointHealth: (environmentId: string) => Promise<EndpointHealth[]>;
  retry: (environmentId: string) => Promise<void>;
  onStatusChange: (cb: (environmentId: string, status: ConnectionStatus) => void) => () => void;
  onEndpointHealthChange: (cb: (environmentId: string, health: EndpointHealth[]) => void) => () => void;
  notifyNetworkChanged: (online: boolean) => void;
}

export interface LoopTaskBridge {
  request: <T = unknown>(args: ApiRequestArgs) => Promise<ApiResponse<T>>;
  subscribeStream: (args: StreamSubscribeArgs) => Promise<void>;
  unsubscribeStream: (subId: string) => Promise<void>;
  onStreamEvent: (cb: (payload: StreamEventPayload) => void) => () => void;
  config: ConfigBridge;
  connection: ConnectionBridge;
}
