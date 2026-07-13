import type { ApiResponse, StreamEventPayload } from "../../shared/ipc";
import type { Environment, LoopMeta, Project, TaskDefinition } from "./types";
import { mockRequest, mockSubscribeLogs } from "./mock";

export const isMock = typeof window !== "undefined" && !window.api;

export function resolveBaseUrl(env: Environment): string {
  if (env.activeEndpointId) {
    const ep = env.endpoints.find((e) => e.id === env.activeEndpointId);
    if (ep) return ep.url;
  }
  return env.endpoints.length > 0 ? env.endpoints[0].url : "";
}

export async function apiRequest<T = unknown>(
  env: Environment,
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: unknown,
): Promise<ApiResponse<T>> {
  if (!window.api) {
    return mockRequest<T>(path);
  }
  const baseUrl = resolveBaseUrl(env);
  return window.api.request<T>({ baseUrl, path, method, body });
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

export function fetchLogs(
  env: Environment,
  loopId: string,
  tail: number,
): Promise<ApiResponse<string>> {
  return apiRequest<string>(env, `/api/loops/${encodeURIComponent(loopId)}/logs?tail=${tail}`);
}

interface LogStreamHandlers {
  onLine: (line: string) => void;
  onClose?: () => void;
}

const handlers = new Map<string, LogStreamHandlers>();
let globalUnlisten: (() => void) | null = null;

function ensureGlobalListener(): void {
  if (globalUnlisten || !window.api) return;
  globalUnlisten = window.api.onStreamEvent((payload: StreamEventPayload) => {
    const handler = handlers.get(payload.subId);
    if (!handler) return;
    if (payload.kind === "data") {
      handler.onLine(payload.text);
    } else if (payload.kind === "end" || payload.kind === "error") {
      handler.onClose?.();
      handlers.delete(payload.subId);
    }
  });
}

export function subscribeLogs(
  env: Environment,
  loopId: string,
  onLine: (line: string) => void,
  onClose?: () => void,
): () => void {
  if (!window.api) {
    return mockSubscribeLogs(loopId, onLine);
  }

  ensureGlobalListener();
  const subId = crypto.randomUUID();
  handlers.set(subId, { onLine, onClose });

  const baseUrl = resolveBaseUrl(env);
  void window.api.subscribeStream({
    subId,
    baseUrl,
    path: `/api/loops/${encodeURIComponent(loopId)}/logs/stream?tail=0`,
  });

  return () => {
    handlers.delete(subId);
    void window.api?.unsubscribeStream(subId);
  };
}


