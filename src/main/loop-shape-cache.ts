import Store from "electron-store";
import type { LoopShape, ChainStep } from "../shared/ipc.js";
import { fetchAndUnwrap } from "./http-utils.js";
import type { Environment } from "../shared/ipc.js";
import { getEnvironments } from "./config-store.js";
import { resolveActiveUrl } from "./connection-supervisor.js";
import { resolveEffectiveUrl } from "./tunnel-registry.js";
import { getSessionToken } from "./config-store.js";

// ── Types for daemon API responses ───────────────────────────────────

interface DaemonLoop {
  id: string;
  command: string;
  commandArgs: string[];
  intervalHuman: string;
  projectId?: string;
  taskId?: string | null;
}

interface DaemonTask {
  id: string;
  name: string;
  command: string;
  commandArgs: string[];
  onSuccessTaskId: string | null;
  onFailureTaskId: string | null;
}

interface DaemonLoopsResponse {
  ok: boolean;
  data: DaemonLoop[];
}

interface DaemonTasksResponse {
  ok: boolean;
  data: DaemonTask[];
}

// ── Cache persistence ────────────────────────────────────────────────

interface LoopShapeCacheSchema {
  loopShapeCache: Record<string, LoopShape[]>;
}

const store = new Store<LoopShapeCacheSchema>({
  defaults: {
    loopShapeCache: {},
  },
});

const PERSISTENCE_KEY = "loopShapeCache";

// ── In-memory cache ──────────────────────────────────────────────────

/** environmentId → loop shapes */
const cache = new Map<string, LoopShape[]>();

/** Listeners for cache updates. */
const listeners = new Set<(shapes: LoopShape[]) => void>();

// Load persisted cache on startup
function loadPersisted(): void {
  const persisted = store.get(PERSISTENCE_KEY) as Record<string, LoopShape[]> | undefined;
  if (persisted) {
    for (const [envId, shapes] of Object.entries(persisted)) {
      cache.set(envId, shapes);
    }
  }
}

function persist(): void {
  const obj: Record<string, LoopShape[]> = {};
  for (const [envId, shapes] of cache.entries()) {
    obj[envId] = shapes;
  }
  store.set(PERSISTENCE_KEY, obj);
}

function notifyListeners(): void {
  const allShapes = getAllCached();
  for (const cb of listeners) {
    try {
      cb(allShapes);
    } catch {
      // listener errors must not break the cache
    }
  }
}

// ── Public API ───────────────────────────────────────────────────────

export function initLoopShapeCache(): void {
  loadPersisted();
}

export function getCached(environmentId: string): LoopShape[] {
  return cache.get(environmentId) ?? [];
}

export function getAllCached(): LoopShape[] {
  const all: LoopShape[] = [];
  for (const shapes of cache.values()) {
    all.push(...shapes);
  }
  return all;
}

export function removeEnvironmentShapes(environmentId: string): void {
  cache.delete(environmentId);
  persist();
  notifyListeners();
}

export function onCacheUpdate(cb: (shapes: LoopShape[]) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Build ChainSteps for loops that reference tasks.
 * Resolves on-success/on-failure links into a flat list.
 */
function buildChainSteps(taskId: string, tasks: DaemonTask[]): ChainStep[] {
  const steps: ChainStep[] = [];
  const visited = new Set<string>();
  let currentId: string | null = taskId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const task = tasks.find((t) => t.id === currentId);
    if (!task) break;

    steps.push({
      taskId: task.id,
      taskName: task.name,
      command: task.command,
      commandArgs: task.commandArgs,
      onSuccessTaskId: task.onSuccessTaskId,
      onFailureTaskId: task.onFailureTaskId,
    });

    currentId = task.onSuccessTaskId;
  }

  return steps;
}

/**
 * Refresh the cache for a specific environment by fetching from its daemon API.
 * Returns the updated shapes for that environment.
 */
export async function refreshForEnvironment(environmentId: string): Promise<LoopShape[]> {
  const envs = getEnvironments();
  const env = envs.find((e: Environment) => e.id === environmentId);
  if (!env) return [];

  const url = resolveActiveUrl(env.endpoints, env.activeEndpointId);
  if (!url) return [];

  // Resolve effective URL (tunneled for SSH)
  const activeEp = env.activeEndpointId
    ? env.endpoints.find((e) => e.id === env.activeEndpointId)
    : env.endpoints[0];
  const effectiveUrl = activeEp ? resolveEffectiveUrl(env.id, activeEp) : url;

  const token = getSessionToken(environmentId);
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token.accessToken}`;

  try {
    const [loopsRes, tasksRes] = await Promise.all([
      fetchAndUnwrap(effectiveUrl.replace(/\/$/, "") + "/api/loops", {
        headers,
        timeoutMs: 10_000,
      }) as Promise<DaemonLoopsResponse>,
      fetchAndUnwrap(effectiveUrl.replace(/\/$/, "") + "/api/tasks", {
        headers,
        timeoutMs: 10_000,
      }) as Promise<DaemonTasksResponse>,
    ]);

    if (!loopsRes.ok || !tasksRes.ok) {
      return cache.get(environmentId) ?? [];
    }

    const loops = loopsRes.data;
    const tasks = tasksRes.data;
    const now = Date.now();

    const shapes: LoopShape[] = loops.map((loop: DaemonLoop): LoopShape => ({
      loopId: loop.id,
      environmentId,
      command: loop.command,
      commandArgs: loop.commandArgs,
      intervalHuman: loop.intervalHuman,
      projectId: loop.projectId,
      taskId: loop.taskId ?? null,
      chainSteps: loop.taskId ? buildChainSteps(loop.taskId, tasks) : [],
      cachedAt: now,
    }));

    cache.set(environmentId, shapes);
    persist();
    notifyListeners();

    return shapes;
  } catch {
    // Fetch failed (instance may be dark) — return stale cache
    return cache.get(environmentId) ?? [];
  }
}

/**
 * Refresh cached shapes for all connected environments.
 * Called on startup and opportunistically on supervisor connect.
 */
export async function refreshAll(): Promise<void> {
  const envs = getEnvironments();
  await Promise.allSettled(
    envs.map((env: Environment) => refreshForEnvironment(env.id)),
  );
}
