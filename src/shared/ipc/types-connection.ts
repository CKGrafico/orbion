import type { I18nMessage } from "./types-common.js";
import type { OpenCodeConnectionStatus } from "./types-config.js";

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

export interface ConnectionBridge {
  getStatus: (environmentId: string) => Promise<ConnectionStatus | null>;
  getEndpointHealth: (environmentId: string) => Promise<EndpointHealth[]>;
  retry: (environmentId: string) => Promise<void>;
  onStatusChange: (cb: (environmentId: string, status: ConnectionStatus) => void) => () => void;
  onEndpointHealthChange: (cb: (environmentId: string, health: EndpointHealth[]) => void) => () => void;
  notifyNetworkChanged: (online: boolean) => void;
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

export interface OpenCodeBridge {
  getStatus: (environmentId: string) => Promise<OpenCodeConnectionStatus>;
  refreshStatus: (environmentId: string) => Promise<OpenCodeConnectionStatus>;
  onStatusChange: (cb: (environmentId: string, status: OpenCodeConnectionStatus) => void) => () => void;
}
