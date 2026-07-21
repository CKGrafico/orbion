/**
 * Shared HTTP fetch + envelope unwrapping utility.
 *
 * Eliminates the 4× duplicated "fetch → check status → JSON parse →
 * check {ok,data,error} envelope → return structured result" pattern
 * across the main process.
 */

import type { I18nMessage } from "../shared/ipc.js";
import { msg } from "./i18n.js";

// ── Types ────────────────────────────────────────────────────────────────

export interface FetchAndUnwrapOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  /** Called when the server responds with 401/403. */
  onUnauthorized?: (status: number) => Promise<void>;
  /**
   * Custom validation for non-envelope JSON responses.
   * Return the typed data to accept, or `null` to reject.
   * When provided, the envelope check is *skipped* — the validator own it.
   */
  validateJson?: (data: unknown) => unknown | null;
  /** i18n key for the generic HTTP error fallback (default: "vmWizard.mainHttpError"). */
  errorKey?: string;
  /** Params for the error i18n key. `{status}` is always included automatically. */
  errorParams?: Record<string, string | number>;
}

export type FetchAndUnwrapResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string | I18nMessage };

// ── Implementation ───────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_BODY_SIZE = 1_000_000;

export async function fetchAndUnwrap<T = unknown>(
  url: string,
  opts: FetchAndUnwrapOptions = {},
): Promise<FetchAndUnwrapResult<T>> {
  const {
    method = "GET",
    headers: extraHeaders,
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    onUnauthorized,
    validateJson,
    errorKey = "vmWizard.mainHttpError",
    errorParams,
  } = opts;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = { ...extraHeaders };
    if (body !== undefined && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const serializedBody = body !== undefined ? JSON.stringify(body) : undefined;
    if (serializedBody !== undefined && serializedBody.length > MAX_BODY_SIZE) {
      return { ok: false, status: 0, error: `body exceeds maximum size of ${MAX_BODY_SIZE} bytes when serialized` };
    }

    const res = await fetch(url, {
      method,
      headers,
      body: serializedBody,
      signal: controller.signal,
    });

    // 401/403 handling
    if ((res.status === 401 || res.status === 403) && onUnauthorized) {
      await onUnauthorized(res.status);
    }

    // ── Custom validator path (fingerprint, pairing code, etc.) ──
    if (validateJson) {
      if (!res.ok) {
        const fallback = msg(errorKey, { status: res.status, ...errorParams });
        // Try to extract envelope error message from non-ok responses
        const text = await res.text().catch(() => "");
        try {
          const parsed = JSON.parse(text) as { error?: { message?: string } };
          if (parsed.error?.message) {
            return { ok: false, status: res.status, error: parsed.error.message };
          }
        } catch { /* use fallback */ }
        return { ok: false, status: res.status, error: fallback };
      }

      const data = await res.json() as unknown;
      const validated = validateJson(data);
      if (validated !== null) {
        return { ok: true, status: res.status, data: validated as T };
      }
      return { ok: false, status: res.status, error: msg(errorKey, { status: res.status, ...errorParams }) };
    }

    // ── Standard envelope path (handleApiRequest, makeProbe) ──
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // keep raw text for non-JSON responses
    }

    if (parsed && typeof parsed === "object" && "ok" in parsed) {
      const envelope = parsed as { ok: boolean; data?: unknown; error?: { message?: string } };
      if (envelope.ok) {
        return { ok: true, status: res.status, data: (envelope.data ?? parsed) as T };
      }
      return {
        ok: false,
        status: res.status,
        error: envelope.error?.message ?? msg(errorKey, { status: res.status, ...errorParams }),
      };
    }

    if (!res.ok) {
      return { ok: false, status: res.status, error: msg(errorKey, { status: res.status, ...errorParams }) };
    }

    return { ok: true, status: res.status, data: parsed as T };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? msg("vmWizard.mainRequestTimedOut")
        : err instanceof Error
          ? err.message
          : String(err);
    return { ok: false, status: 0, error: message };
  } finally {
    clearTimeout(timeout);
  }
}
