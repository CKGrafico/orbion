import { cid, container, useInject } from "inversify-hooks";
import type { ApiResponse, StreamEventPayload } from "../../shared/ipc";
import type { Environment, LoopMeta, Project, TaskDefinition } from "./types";
import type { IApiService, IStreamService } from "./services/interfaces";

export function resolveBaseUrl(env: Environment): string {
  if (env.activeEndpointId) {
    const ep = env.endpoints.find((e) => e.id === env.activeEndpointId);
    if (ep) return ep.url;
  }
  return env.endpoints.length > 0 ? env.endpoints[0].url : "";
}

export interface DaemonSettings {
  httpApiEnabled: boolean;
  mcpApiEnabled: boolean;
  httpApiHost: string;
}

// ── Standalone functions (resolve from container — for use inside effects/callbacks) ──

function getApiService(): IApiService {
  return container.resolve<IApiService>(cid.IApiService as unknown as string);
}

function getStreamService(): IStreamService {
  return container.resolve<IStreamService>(cid.IStreamService as unknown as string);
}

export function apiRequest<T = unknown>(
  env: Environment,
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: unknown,
): Promise<ApiResponse<T>> {
  const baseUrl = resolveBaseUrl(env);
  return getApiService().request<T>({ baseUrl, path, method, body });
}

export function fetchLoops(env: Environment): Promise<ApiResponse<LoopMeta[]>> {
  return apiRequest<LoopMeta[]>(env, "/api/loops");
}

export function fetchLoop(env: Environment, id: string): Promise<ApiResponse<LoopMeta>> {
  return apiRequest<LoopMeta>(env, `/api/loops/${encodeURIComponent(id)}`);
}

export function fetchProjects(env: Environment): Promise<ApiResponse<Project[]>> {
  return apiRequest<Project[]>(env, "/api/projects");
}

export function fetchTasks(env: Environment): Promise<ApiResponse<TaskDefinition[]>> {
  return apiRequest<TaskDefinition[]>(env, "/api/tasks");
}

export function fetchLogs(env: Environment, loopId: string, tail: number): Promise<ApiResponse<string>> {
  return apiRequest<string>(env, `/api/loops/${encodeURIComponent(loopId)}/logs?tail=${tail}`);
}

export function fetchSettings(env: Environment): Promise<ApiResponse<DaemonSettings>> {
  return apiRequest<DaemonSettings>(env, "/api/settings");
}

// ── Loop mutations ──

export function pauseLoop(env: Environment, loopId: string): Promise<ApiResponse> {
  return apiRequest(env, `/api/loops/${encodeURIComponent(loopId)}/pause`, "POST");
}

export function resumeLoop(env: Environment, loopId: string): Promise<ApiResponse> {
  return apiRequest(env, `/api/loops/${encodeURIComponent(loopId)}/resume`, "POST");
}

export function stopLoop(env: Environment, loopId: string): Promise<ApiResponse> {
  return apiRequest(env, `/api/loops/${encodeURIComponent(loopId)}/stop`, "POST");
}

export function triggerLoop(env: Environment, loopId: string): Promise<ApiResponse> {
  return apiRequest(env, `/api/loops/${encodeURIComponent(loopId)}/trigger`, "POST");
}

// ── Loop creation ──

export interface CreateLoopParams {
  command: string;
  commandArgs?: string[];
  interval: string;
  projectId?: string;
  description?: string;
  runImmediately?: boolean;
  maxRuns?: number | null;
}

export function createLoop(env: Environment, params: CreateLoopParams): Promise<ApiResponse<LoopMeta>> {
  const body: Record<string, unknown> = {
    command: params.command,
    interval: params.interval,
  };
  if (params.commandArgs?.length) body.commandArgs = params.commandArgs;
  if (params.projectId) body.projectId = params.projectId;
  if (params.description) body.description = params.description;
  if (params.runImmediately) body.runImmediately = true;
  if (params.maxRuns != null) body.maxRuns = params.maxRuns;

  return apiRequest<LoopMeta>(env, "/api/loops", "POST", body);
}

// ── Agent command detection ──

/** Known agent runtime commands that should trigger a max-runs suggestion. */
const AGENT_COMMANDS = new Set([
  "opencode",
  "claude-code",
  "claude",
  "codex",
]);

/**
 * Detect whether a command invokes an agent runtime.
 * Used to nudge the user towards setting a max-runs cap.
 */
export function isAgentCommand(command: string): boolean {
  const baseCommand = command.trim().split(/\s+/)[0] ?? "";
  // Strip path prefix to get the bare command name
  const basename = baseCommand.split("/").pop() ?? baseCommand;
  // Also strip common extensions
  const bare = basename.replace(/\.(exe|cmd|bat|sh)$/, "");
  return AGENT_COMMANDS.has(bare);
}

/** Default suggested max-runs cap for agent commands. */
export const SUGGESTED_MAX_RUNS = 10;

// ── SSE log streaming (standalone) ──

const streamHandlers = new Map<string, LogStreamHandlers>();
let globalUnlisten: (() => void) | null = null;

interface LogStreamHandlers {
  onLine: (line: string) => void;
  onEvent?: (parsed: unknown) => void;
  onClose?: () => void;
}

function ensureGlobalListener(): void {
  if (globalUnlisten) return;
  const streamService = getStreamService();
  globalUnlisten = streamService.onStreamEvent((payload: StreamEventPayload) => {
    const handler = streamHandlers.get(payload.subId);
    if (!handler) return;
    if (payload.kind === "data") {
      handler.onLine(payload.text);
    } else if (payload.kind === "event") {
      if (handler.onEvent) {
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(payload.text);
        } catch {
          // Not valid JSON, fall back to plain text
          handler.onLine(payload.text);
          return;
        }
        handler.onEvent(parsed);
      } else {
        // No event handler, fall back to plain text
        handler.onLine(payload.text);
      }
    } else if (payload.kind === "end" || payload.kind === "error") {
      handler.onClose?.();
      streamHandlers.delete(payload.subId);
    }
  });
}

export function subscribeLogs(
  env: Environment,
  loopId: string,
  onLine: (line: string) => void,
  onClose?: () => void,
  onEvent?: (parsed: unknown) => void,
): () => void {
  ensureGlobalListener();
  const streamService = getStreamService();
  const subId = crypto.randomUUID();
  streamHandlers.set(subId, { onLine, onClose, onEvent });

  const baseUrl = resolveBaseUrl(env);
  void streamService.subscribeStream({
    subId,
    baseUrl,
    path: `/api/loops/${encodeURIComponent(loopId)}/logs/stream?tail=0`,
  });

  return () => {
    streamHandlers.delete(subId);
    void streamService.unsubscribeStream(subId);
  };
}

// ── isMock — true when running without Electron (browser-only dev) ──

export const isMock = typeof window !== "undefined" && !window.api;
