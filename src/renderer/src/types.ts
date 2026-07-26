import type { EndpointKind, TailscalePeer, TailscalePeersResponse, EnvironmentAuthState, EnvironmentRole, SessionScope, PairingCodeExchangeResponse, OpenCodeAuthState, OpenCodeErrorKind, OpenCodeConnectionStatus, OpenCodeEndpoint, I18nMessage, AccessEndpoint, ReachabilityState, AgentRuntime, RuntimeState, ModelInfo, ReasoningEffort, ListModelsResult, Environment } from "../../shared/ipc";

export type { EndpointKind, TailscalePeer, TailscalePeersResponse, EnvironmentAuthState, EnvironmentRole, SessionScope, PairingCodeExchangeResponse, OpenCodeAuthState, OpenCodeErrorKind, OpenCodeConnectionStatus, OpenCodeEndpoint, I18nMessage, AccessEndpoint, ReachabilityState, AgentRuntime, RuntimeState, ModelInfo, ReasoningEffort, ListModelsResult, Environment };

export type LoopStatus = "running" | "waiting" | "paused" | "stopped" | "failed" | "finished";

export interface RunRecord {
  runNumber: number;
  startedAt: string;
  exitCode: number | null;
  duration: number | null;
  logSize: number;
  status: "running" | "completed";
  logOffset: number;
}

export interface LoopMeta {
  id: string;
  description?: string;
  status: LoopStatus;
  command: string;
  commandArgs: string[];
  cwd: string;
  intervalHuman: string;
  maxRuns: number | null;
  runCount: number;
  skippedCount: number;
  lastExitCode: number | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  sessionStartedAt?: string | null;
  createdAt?: string;
  pid: number | null;
  projectId?: string;
  taskId?: string | null;
  runHistory: RunRecord[];
}

export interface Project {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  isSystem?: boolean;
}

export interface TaskDefinition {
  id: string;
  name: string;
  command: string;
  commandArgs: string[];
  commandRaw?: string;
  onSuccessTaskId: string | null;
  onFailureTaskId: string | null;
  createdAt: string;
}

export type EnvironmentHealth = "unknown" | "ok" | "offline" | "connecting" | "backoff" | "blocked";

/** Loops paired with fleet-local origin metadata for rendering fleet-wide loop bars and cards. */
export interface LoopWithOrigin {
  loop: LoopMeta;
  environmentId: string;
  environmentName: string;
  projectName: string;
}

/** Fleet-wide rollup. Excludes unreachable instances from counts. */
export interface FleetLoopRollup {
  loopsWithOrigin: LoopWithOrigin[];
  projectCount: number;
  counts: Record<LoopStatus, number>;
}
