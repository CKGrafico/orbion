/**
 * Daemon Request Allowlist — central registry of method/path combinations
 * the renderer is permitted to invoke through the generic IPC daemon bridge.
 *
 * Security principle: the main process MUST validate method+path against this
 * allowlist before forwarding any request with stored credentials. A compromised
 * renderer can send arbitrary IPC payloads; this allowlist is the trust boundary.
 *
 * To add a new daemon operation:
 *   1. Add the method+path pattern to `ALLOWED_API_OPERATIONS` or `ALLOWED_STREAM_PATHS`.
 *   2. Add a positive test in __tests__/daemon-allowlist.test.ts.
 *   3. Verify no negative test breaks (arbitrary paths are still rejected).
 */

// ── API request allowlist ─────────────────────────────────────────────

export type AllowedMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface AllowedOperation {
  method: AllowedMethod;
  /** RegExp pattern matched against the request path. Must match the full path. */
  pathPattern: RegExp;
  /** Human-readable description of the operation. */
  description: string;
}

/**
 * Every method+path combination the renderer may invoke through `api:request`.
 *
 * Path patterns use named capture groups for readability but enforcement
 * only cares whether the pattern matches, not the captures.
 */
export const ALLOWED_API_OPERATIONS: readonly AllowedOperation[] = [
  // ── Read operations ───────────────────────────────────────────
  {
    method: "GET",
    pathPattern: /^\/api\/loops$/,
    description: "List all loops",
  },
  {
    method: "GET",
    pathPattern: /^\/api\/loops\/[^/]+$/,
    description: "Get a single loop by ID",
  },
  {
    method: "GET",
    pathPattern: /^\/api\/loops\/[^/]+\/logs$/,
    description: "Get loop logs (query params: tail)",
  },
  {
    method: "GET",
    pathPattern: /^\/api\/projects$/,
    description: "List projects",
  },
  {
    method: "GET",
    pathPattern: /^\/api\/tasks$/,
    description: "List task definitions",
  },
  {
    method: "GET",
    pathPattern: /^\/api\/settings$/,
    description: "Get daemon settings",
  },

  // ── Mutation operations (intentionally supported) ──────────────
  {
    method: "POST",
    pathPattern: /^\/api\/loops\/[^/]+\/pause$/,
    description: "Pause a loop",
  },
  {
    method: "POST",
    pathPattern: /^\/api\/loops\/[^/]+\/resume$/,
    description: "Resume a loop",
  },
  {
    method: "POST",
    pathPattern: /^\/api\/loops\/[^/]+\/trigger$/,
    description: "Trigger a loop run",
  },
  {
    method: "POST",
    pathPattern: /^\/api\/repos\/clone$/,
    description: "Clone a repository",
  },
];

// ── Stream (SSE) allowlist ────────────────────────────────────────────

/**
 * Every path the renderer may subscribe to through `stream:subscribe`.
 * Path patterns must match before the query string.
 */
export const ALLOWED_STREAM_PATHS: readonly RegExp[] = [
  /^\/api\/loops\/[^/]+\/logs\/stream$/,
];

// ── Validation helpers ────────────────────────────────────────────────

/**
 * Check whether a method+path combination is allowed for API requests.
 * Strips query string from the path before matching.
 */
export function isAllowedApiOperation(method: string, path: string): boolean {
  const pathWithoutQuery = stripQueryString(path);
  return ALLOWED_API_OPERATIONS.some(
    (op) => op.method === method && op.pathPattern.test(pathWithoutQuery),
  );
}

/**
 * Check whether a path is allowed for stream subscriptions.
 * Strips query string from the path before matching.
 */
export function isAllowedStreamPath(path: string): boolean {
  const pathWithoutQuery = stripQueryString(path);
  return ALLOWED_STREAM_PATHS.some((pat) => pat.test(pathWithoutQuery));
}

/**
 * Return the matching AllowedOperation if found, or null.
 * Useful for error messages that reference the expected operation.
 */
export function findAllowedOperation(
  method: string,
  path: string,
): AllowedOperation | null {
  const pathWithoutQuery = stripQueryString(path);
  return (
    ALLOWED_API_OPERATIONS.find(
      (op) => op.method === method && op.pathPattern.test(pathWithoutQuery),
    ) ?? null
  );
}

// ── Internal helpers ──────────────────────────────────────────────────

function stripQueryString(path: string): string {
  const qIndex = path.indexOf("?");
  return qIndex >= 0 ? path.slice(0, qIndex) : path;
}
