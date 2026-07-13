// Shared IPC contract between main, preload, and renderer.
// All HTTP to loop-task instances runs in the MAIN process: the loop-task
// daemon sends no CORS headers, so renderer fetch would be blocked — and
// main-process fetch also works unchanged for instances on remote VMs.

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
  /** Line content for "data", event name for "event", message for "error". */
  text: string;
}

// ── Config store (electron-store) ───────────────────────────────────

export interface Instance {
  id: string;
  name: string;
  baseUrl: string;
}

export interface ConfigBridge {
  getInstances: () => Promise<Instance[]>;
  addInstance: (name: string, baseUrl: string) => Promise<Instance>;
  removeInstance: (id: string) => Promise<void>;
  getSelectedInstanceId: () => Promise<string | null>;
  setSelectedInstanceId: (id: string | null) => Promise<void>;
  migrateFromLocalStorage: (rawInstances: string, rawSelectedId: string | null) => Promise<boolean>;
}

// ── Full IPC bridge ─────────────────────────────────────────────────

export interface LoopTaskBridge {
  request: <T = unknown>(args: ApiRequestArgs) => Promise<ApiResponse<T>>;
  subscribeStream: (args: StreamSubscribeArgs) => Promise<void>;
  unsubscribeStream: (subId: string) => Promise<void>;
  onStreamEvent: (cb: (payload: StreamEventPayload) => void) => () => void;
  config: ConfigBridge;
}
