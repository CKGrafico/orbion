import type { EndpointKind, TailscalePeer, TailscalePeersResponse } from "../../shared/ipc";

export type { EndpointKind, TailscalePeer, TailscalePeersResponse };

export type LoopStatus = "running" | "waiting" | "paused" | "idle" | "stopped";

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

export type Section = "loops" | "tasks" | "projects";

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

export type EnvironmentHealth = "unknown" | "ok" | "offline" | "connecting" | "backoff" | "blocked";
