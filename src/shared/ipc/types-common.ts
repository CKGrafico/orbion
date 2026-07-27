import type { LogEntry } from "../log.js";

export interface I18nMessage {
  key: string;
  params?: Record<string, string | number>;
}

export interface ApiRequestArgs {
  baseUrl: string;
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
}

/** Generic API response. T must be structured-clone-serializable when crossing IPC. */
export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string | I18nMessage;
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

export type SessionScope = "read-only" | "operate" | "admin";

export interface SessionToken {
  accessToken: string;
  scope: SessionScope;
  expiresAt: number | null;
}

export interface PairingCodeExchangeResponse {
  ok: boolean;
  token?: SessionToken;
  error?: string | I18nMessage;
}

export interface SweepEphemeralSessionsArgs {
  activeSessionId: string | null;
  inactivityThresholdHours: number;
}

export interface SweepEphemeralSessionsResult {
  removedSessionIds: string[];
}

export interface LogBridge {
  write: (entry: LogEntry) => void;
}
