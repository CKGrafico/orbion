import type { AccessEndpoint, EndpointHealth } from "../shared/ipc.js";

export type ConnectionPhase =
  | "offline"
  | "connecting"
  | "connected"
  | "backoff"
  | "blocked";

export type ErrorClass = "transient" | "blocking";

export interface ConnectionStatus {
  phase: ConnectionPhase;
  lastError: string | null;
  errorClass: ErrorClass | null;
  failureCount: number;
  backoffMs: number;
  lastConnectedAt: number | null;
}

interface ProbeResult {
  ok: boolean;
  status: number;
  error: string | null;
}

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 16_000;
const STABLE_MS = 30_000;
const PROBE_TIMEOUT_MS = 5_000;
const FINGERPRINT_TIMEOUT_MS = 3_000;

function classifyError(
  status: number,
  errorMessage: string | null,
): ErrorClass {
  if (status === 401 || status === 403) return "blocking";
  if (errorMessage) {
    const lower = errorMessage.toLowerCase();
    if (
      lower.includes("invalid environment url") ||
      lower.includes("unsupported protocol")
    ) {
      return "blocking";
    }
  }
  return "transient";
}

function isNetworkDownError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("enetunreach") ||
    lower.includes("econnrefused") ||
    lower.includes("getaddrinfo enotfound") ||
    lower.includes("network is unreachable") ||
    lower.includes("net::err_network_changed") ||
    lower.includes("net::err_internet_disconnected") ||
    lower.includes("net::err_name_not_resolved") ||
    lower.includes("net::err_connection_refused") ||
    lower.includes("request timed out")
  );
}

export class ConnectionSupervisor {
  private phase: ConnectionPhase = "offline";
  private lastError: string | null = null;
  private errorClass: ErrorClass | null = null;
  private failureCount = 0;
  private backoffMs = INITIAL_BACKOFF_MS;
  private lastConnectedAt: number | null = null;
  private connectedSince: number | null = null;

  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stableCheckTimer: ReturnType<typeof setInterval> | null = null;
  private probeInFlight = false;
  private destroyed = false;

  private readonly onChange: (status: ConnectionStatus) => void;
  private readonly probe: () => Promise<ProbeResult>;

  constructor(
    probe: () => Promise<ProbeResult>,
    onChange: (status: ConnectionStatus) => void,
  ) {
    this.probe = probe;
    this.onChange = onChange;
  }

  start(): void {
    if (this.destroyed) return;
    this.scheduleConnect();
  }

  destroy(): void {
    this.destroyed = true;
    this.clearRetryTimer();
    this.clearStableCheck();
  }

  wakeup(): void {
    if (this.destroyed) return;

    if (this.phase === "backoff") {
      this.clearRetryTimer();
      this.scheduleConnect();
    } else if (this.phase === "offline") {
      this.scheduleConnect();
    } else if (this.phase === "blocked") {
      this.scheduleConnect();
    }
  }

  getStatus(): ConnectionStatus {
    return {
      phase: this.phase,
      lastError: this.lastError,
      errorClass: this.errorClass,
      failureCount: this.failureCount,
      backoffMs: this.backoffMs,
      lastConnectedAt: this.lastConnectedAt,
    };
  }

  private scheduleConnect(): void {
    if (this.destroyed || this.probeInFlight) return;

    this.setPhase("connecting");
    this.probeInFlight = true;

    this.probe()
      .then((result) => {
        if (this.destroyed) return;
        this.probeInFlight = false;
        this.handleProbeResult(result);
      })
      .catch(() => {
        if (this.destroyed) return;
        this.probeInFlight = false;
        this.handleProbeResult({ ok: false, status: 0, error: "Probe failed" });
      });
  }

  private handleProbeResult(result: ProbeResult): void {
    if (this.destroyed) return;

    if (result.ok) {
      this.onConnected();
      return;
    }

    this.onError(result.status, result.error);
  }

  private onConnected(): void {
    this.failureCount = 0;
    this.backoffMs = INITIAL_BACKOFF_MS;
    this.lastError = null;
    this.errorClass = null;
    this.lastConnectedAt = Date.now();
    this.connectedSince = Date.now();

    this.clearRetryTimer();
    this.startStableCheck();
    this.setPhase("connected");
  }

  private onError(status: number, errorMessage: string | null): void {
    const cls = classifyError(status, errorMessage);
    this.errorClass = cls;

    if (cls === "blocking") {
      this.lastError = errorMessage ?? `HTTP ${status}`;
      this.clearRetryTimer();
      this.clearStableCheck();
      this.setPhase("blocked");
      return;
    }

    if (errorMessage && isNetworkDownError(errorMessage)) {
      this.lastError = errorMessage;
      this.connectedSince = null;
      this.clearRetryTimer();
      this.clearStableCheck();
      this.setPhase("offline");
      return;
    }

    this.failureCount++;
    this.lastError = errorMessage ?? `HTTP ${status}`;
    this.connectedSince = null;
    this.clearStableCheck();

    this.backoffMs = Math.min(
      INITIAL_BACKOFF_MS * Math.pow(2, this.failureCount - 1),
      MAX_BACKOFF_MS,
    );

    this.setPhase("backoff");
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (this.destroyed) return;
    this.clearRetryTimer();

    const delay = this.backoffMs;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.scheduleConnect();
    }, delay);
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private startStableCheck(): void {
    this.clearStableCheck();

    this.stableCheckTimer = setInterval(() => {
      if (this.destroyed) {
        this.clearStableCheck();
        return;
      }

      if (this.connectedSince && Date.now() - this.connectedSince >= STABLE_MS) {
        this.failureCount = 0;
        this.backoffMs = INITIAL_BACKOFF_MS;
        this.connectedSince = Date.now();
      }
    }, 5_000);
  }

  private clearStableCheck(): void {
    if (this.stableCheckTimer !== null) {
      clearInterval(this.stableCheckTimer);
      this.stableCheckTimer = null;
    }
  }

  private setPhase(next: ConnectionPhase): void {
    if (this.phase === next) return;
    this.phase = next;
    this.emitChange();
  }

  private emitChange(): void {
    if (this.destroyed) return;
    this.onChange(this.getStatus());
  }
}

export function makeProbe(baseUrl: string): () => Promise<ProbeResult> {
  return async (): Promise<ProbeResult> => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

      const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/loops`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        return { ok: false, status: res.status, error: `HTTP ${res.status}` };
      }

      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        // keep raw text
      }

      if (parsed && typeof parsed === "object" && "ok" in parsed) {
        const envelope = parsed as { ok: boolean; error?: { message?: string } };
        if (envelope.ok) {
          return { ok: true, status: res.status, error: null };
        }
        return {
          ok: false,
          status: res.status,
          error: envelope.error?.message ?? `HTTP ${res.status}`,
        };
      }

      return { ok: true, status: res.status, error: null };
    } catch (err) {
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "Request timed out"
          : err instanceof Error
            ? err.message
            : String(err);
      return { ok: false, status: 0, error: message };
    }
  };
}

export function makeEndpointProbe(baseUrl: string): () => Promise<ProbeResult> {
  return makeProbe(baseUrl);
}

export interface EnvironmentFingerprint {
  id: string;
  label: string;
}

export async function fetchFingerprint(baseUrl: string): Promise<EnvironmentFingerprint | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FINGERPRINT_TIMEOUT_MS);

    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/.well-known/orbion/environment`, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json() as unknown;
    if (typeof data === "object" && data !== null && "id" in data && "label" in data) {
      return data as EnvironmentFingerprint;
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveActiveUrl(endpoints: AccessEndpoint[], activeEndpointId: string | null): string | null {
  if (endpoints.length === 0) return null;
  if (activeEndpointId) {
    const ep = endpoints.find((e) => e.id === activeEndpointId);
    if (ep) return ep.url;
  }
  return endpoints[0].url;
}

export class EndpointHealthTracker {
  private health = new Map<string, { lastError: string | null; failureCount: number }>();
  private supervisors = new Map<string, ConnectionSupervisor>();
  private readonly environmentId: string;
  private readonly onHealthChange: (health: EndpointHealth[]) => void;

  constructor(
    environmentId: string,
    onHealthChange: (health: EndpointHealth[]) => void,
  ) {
    this.environmentId = environmentId;
    this.onHealthChange = onHealthChange;
  }

  syncEndpoints(endpoints: AccessEndpoint[]): void {
    const currentIds = new Set(this.supervisors.keys());
    const newIds = new Set(endpoints.map((e) => e.id));

    for (const id of currentIds) {
      if (!newIds.has(id)) {
        this.supervisors.get(id)!.destroy();
        this.supervisors.delete(id);
        this.health.delete(id);
      }
    }

    for (const ep of endpoints) {
      if (!this.supervisors.has(ep.id)) {
        const supervisor = new ConnectionSupervisor(
          makeEndpointProbe(ep.url),
          (status) => {
            this.health.set(ep.id, {
              lastError: status.lastError,
              failureCount: status.failureCount,
            });
            this.onHealthChange(this.getHealth());
          },
        );
        this.supervisors.set(ep.id, supervisor);
        supervisor.start();
      }
    }

    this.onHealthChange(this.getHealth());
  }

  getHealth(): EndpointHealth[] {
    const result: EndpointHealth[] = [];
    for (const [id, h] of this.health) {
      result.push({
        endpointId: id,
        phase: h.failureCount > 0 && h.lastError ? "backoff" : "connected",
        lastError: h.lastError,
        failureCount: h.failureCount,
      });
    }
    return result;
  }

  destroy(): void {
    for (const supervisor of this.supervisors.values()) {
      supervisor.destroy();
    }
    this.supervisors.clear();
    this.health.clear();
  }
}
