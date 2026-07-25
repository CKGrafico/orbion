/** Daemon Request Allowlist — method/path combinations the renderer may invoke through the IPC daemon bridge.
 *  Security: the main process MUST validate method+path against this allowlist before forwarding requests
 *  with stored credentials. A compromised renderer can send arbitrary IPC payloads; this is the trust boundary.
 *  To add: 1) add to ALLOWED_API_OPERATIONS or ALLOWED_STREAM_PATHS, 2) add positive test, 3) verify negatives. */

export type AllowedMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface AllowedOperation {
  method: AllowedMethod;
  pathPattern: RegExp;
  description: string;
}

export const ALLOWED_API_OPERATIONS: readonly AllowedOperation[] = [
  { method: "GET", pathPattern: /^\/api\/loops$/, description: "List all loops" },
  { method: "GET", pathPattern: /^\/api\/loops\/[^/]+$/, description: "Get a single loop by ID" },
  { method: "GET", pathPattern: /^\/api\/loops\/[^/]+\/logs$/, description: "Get loop logs (query params: tail)" },
  { method: "GET", pathPattern: /^\/api\/projects$/, description: "List projects" },
  { method: "GET", pathPattern: /^\/api\/tasks$/, description: "List task definitions" },
  { method: "GET", pathPattern: /^\/api\/settings$/, description: "Get daemon settings" },
  { method: "POST", pathPattern: /^\/api\/loops\/[^/]+\/pause$/, description: "Pause a loop" },
  { method: "POST", pathPattern: /^\/api\/loops\/[^/]+\/resume$/, description: "Resume a loop" },
  { method: "POST", pathPattern: /^\/api\/loops\/[^/]+\/trigger$/, description: "Trigger a loop run" },
  { method: "POST", pathPattern: /^\/api\/loops\/[^/]+\/stop$/, description: "Stop a loop (clears schedule)" },
  { method: "POST", pathPattern: /^\/api\/repos\/clone$/, description: "Clone a repository" },
];

export const ALLOWED_STREAM_PATHS: readonly RegExp[] = [
  /^\/api\/loops\/[^/]+\/logs\/stream$/,
];

export function isAllowedApiOperation(method: string, path: string): boolean {
  const pathWithoutQuery = stripQueryString(path);
  return ALLOWED_API_OPERATIONS.some(
    (op) => op.method === method && op.pathPattern.test(pathWithoutQuery),
  );
}

export function isAllowedStreamPath(path: string): boolean {
  const pathWithoutQuery = stripQueryString(path);
  return ALLOWED_STREAM_PATHS.some((pat) => pat.test(pathWithoutQuery));
}

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

function stripQueryString(path: string): string {
  const qIndex = path.indexOf("?");
  return qIndex >= 0 ? path.slice(0, qIndex) : path;
}
