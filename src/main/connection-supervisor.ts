import type { AccessEndpoint, EndpointHealth, I18nMessage } from "../shared/ipc.js";
import { trimTrailingSlash } from "../shared/utils.js";
import { getSessionToken, setEnvironmentAuthState, removeSessionToken } from "./config-store.js";
import { fetchAndUnwrap } from "./http-utils.js";
import { msg } from "./i18n.js";

export type ConnectionPhase =
  | "offline"
  | "connecting"
  | "connected"
  | "backoff"
  | "blocked";

export type ErrorClass = "transient" | "blocking";

export interface ConnectionStatus {
  phase: ConnectionPhase;
  lastError: string | I18nMessage | null;
  errorClass: ErrorClass | null;
  failureCount: number;
  backoffMs: number;
  lastConnectedAt: number | null;
}

interface ProbeResult {
  ok: boolean;
  status: number;
  error: string | I18nMessage | null;
}

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 16_000;
const STABLE_MS = 30_000;
const PROBE_TIMEOUT_MS = 5_000;
const FINGERPRINT_TIMEOUT_MS = 3_000;

function errorText(message: string | I18nMessage | null): string | null {
  if (!message) return null;
  if (typeof message === "string") return message;
  return message.key;
}

export function classifyError(
  status: number,
  errorMessage: string | I18nMessage | null,
): ErrorClass {
  if (status === 401 || status === 403) return "blocking";
  const text = errorText(errorMessage);
  if (text) {
    const lower = text.toLowerCase();
    if (
      lower.includes("invalid environment url") ||
      lower.includes("unsupported protocol") ||
      lower.includes("maininvalidenvurl")
    ) {
      return "blocking";
    }
  }
  return "transient";
}

export function isNetworkDownError(message: string | I18nMessage): boolean {
  const text = typeof message === "string" ? message : message.key;
  const lower = text.toLowerCase();
  return (
    lower.includes("enetunreach") ||
    lower.includes("econnrefused") ||
    lower.includes("getaddrinfo enotfound") ||
    lower.includes("network is unreachable") ||
    lower.includes("net::err_network_changed") ||
    lower.includes("net::err_internet_disconnected") ||
    lower.includes("net::err_name_not_resolved") ||
    lower.includes("net::err_connection_refused") ||
    lower.includes("request timed out") ||
    lower.includes("mainrequesttimedout")
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
  private osOffline = false;

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

  setOsOffline(value: boolean): void {
    if (this.destroyed || this.osOffline === value) return;
    this.osOffline = value;

    if (value) {
      this.clearRetryTimer();
      if (this.phase !== "connected") {
        this.connectedSince = null;
        this.setPhase("offline");
      }
    } else {
      if (this.phase !== "connected") {
        this.scheduleConnect();
      }
    }
  }

  wakeup(): void {
    if (this.destroyed) return;
    if (this.osOffline) return;

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
    if (this.osOffline) {
      if (this.phase !== "offline") {
        this.setPhase("offline");
      }
      return;
    }

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
        this.handleProbeResult({ ok: false, status: 0, error: msg("vmWizard.mainProbeFailed") });
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

  private onError(status: number, errorMessage: string | I18nMessage | null): void {
    const cls = classifyError(status, errorMessage);
    this.errorClass = cls;

    if (cls === "blocking") {
      this.lastError = errorMessage ?? msg("vmWizard.mainHttpError", { status });
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
    this.lastError = errorMessage ?? msg("vmWizard.mainHttpError", { status });
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

export function makeProbe(baseUrl: string, environmentId?: string): () => Promise<ProbeResult> {
  return async (): Promise<ProbeResult> => {
    const headers: Record<string, string> = {};
    if (environmentId) {
      const token = getSessionToken(environmentId);
      if (token) headers["Authorization"] = `Bearer ${token.accessToken}`;
    }

    const result = await fetchAndUnwrap(`${trimTrailingSlash(baseUrl)}/api/loops`, {
      method: "GET",
      headers,
      timeoutMs: PROBE_TIMEOUT_MS,
      onUnauthorized: environmentId
        ? async () => {
            await removeSessionToken(environmentId);
            await setEnvironmentAuthState(environmentId, "blocked");
          }
        : undefined,
    });

    if (result.ok) {
      return { ok: true, status: result.status, error: null };
    }
    return { ok: false, status: result.status, error: result.error };
  };
}

export function makeEndpointProbe(baseUrl: string, environmentId?: string): () => Promise<ProbeResult> {
  return makeProbe(baseUrl, environmentId);
}

export interface EnvironmentFingerprint {
  id: string;
  label: string;
}

export async function fetchFingerprint(baseUrl: string): Promise<EnvironmentFingerprint | null> {
  const result = await fetchAndUnwrap<EnvironmentFingerprint>(
    `${trimTrailingSlash(baseUrl)}/.well-known/orbion/environment`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      timeoutMs: FINGERPRINT_TIMEOUT_MS,
      validateJson: (data) => {
        if (typeof data === "object" && data !== null && "id" in data && "label" in data) {
          return data;
        }
        return null;
      },
    },
  );

  if (result.ok) return result.data;
  return null;
}

export function resolveActiveUrl(endpoints: AccessEndpoint[], activeEndpointId: string | null): string | null {
  if (endpoints.length === 0) return null;
  if (activeEndpointId) {
    const ep = endpoints.find((e) => e.id === activeEndpointId);
    if (ep) return ep.url;
  }
  return endpoints[0].url;
}

interface EndpointHealthEntry {
  lastError: string | I18nMessage | null;
  failureCount: number;
  phase: ConnectionPhase;
}

export class EndpointHealthTracker {
  private health = new Map<string, EndpointHealthEntry>();
  private supervisors = new Map<string, ConnectionSupervisor>();
  private readonly onHealthChange: (health: EndpointHealth[]) => void;

  constructor(
    environmentId: string,
    onHealthChange: (health: EndpointHealth[]) => void,
  ) {
    this._environmentId = environmentId;
    this.onHealthChange = onHealthChange;
  }

  private _environmentId: string;

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
          makeEndpointProbe(ep.url, this._environmentId),
          (status) => {
            this.health.set(ep.id, {
              lastError: status.lastError,
              failureCount: status.failureCount,
              phase: status.phase,
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
        phase: h.phase,
        lastError: h.lastError,
        failureCount: h.failureCount,
      });
    }
    return result;
  }

  setOsOffline(value: boolean): void {
    for (const supervisor of this.supervisors.values()) {
      supervisor.setOsOffline(value);
    }
  }

  wakeup(): void {
    for (const supervisor of this.supervisors.values()) {
      supervisor.wakeup();
    }
  }

  destroy(): void {
    for (const supervisor of this.supervisors.values()) {
      supervisor.destroy();
    }
    this.supervisors.clear();
    this.health.clear();
  }
}
