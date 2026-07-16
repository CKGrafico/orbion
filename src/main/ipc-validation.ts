/**
 * IPC Input Validation — runtime boundary checks for ipcMain.handle() channels.
 *
 * TypeScript annotations on IPC handler args are compile-time only. At runtime,
 * a compromised renderer can send any value. This module validates every argument
 * before it reaches business logic, returning structured errors on failure.
 *
 * No external dependencies — manual validation only.
 */

// ── Helpers ────────────────────────────────────────────────────────────

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === "boolean";
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isNonEmptyString(v: unknown): v is string {
  return isString(v) && v.length > 0;
}

function isValidHttpUrl(v: unknown): v is string {
  if (!isString(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isAllowedPath(v: unknown): v is string {
  if (!isString(v)) return false;
  // Must start with / and must not contain path traversal
  return v.startsWith("/") && !v.includes("..");
}

function isEnum<T extends string>(v: unknown, values: readonly T[]): v is T {
  return isString(v) && (values as readonly string[]).includes(v);
}

// ── IpcValidationError ────────────────────────────────────────────────

export class IpcValidationError extends Error {
  constructor(
    public readonly channel: string,
    public readonly issues: string[],
  ) {
    super(`IPC validation failed on "${channel}": ${issues.join("; ")}`);
    this.name = "IpcValidationError";
  }
}

// ── Per-channel validators ────────────────────────────────────────────

type Validator = (args: unknown[]) => string[];

const ENDPOINT_KINDS = ["direct", "ssh", "tailscale"] as const;
const SESSION_SCOPES = ["read-only", "operate", "admin"] as const;
const API_METHODS = ["GET", "POST", "PATCH", "DELETE"] as const;
const INFRA_ACTIONS = ["machine-status", "clone-repo"] as const;
const CONSENT_DECISIONS = ["install", "skip"] as const;

const SERVICE_SELECTION_KEYS = [
  "installOpenCode",
  "installGh",
  "installAzDo",
  "installJira",
  "installGitlab",
  "installDocker",
  "installTerraform",
  "installTailscale",
  "installClaudeCli",
  "installJq",
  "installRipgrep",
] as const;

/**
 * Registry: channel name → argument validator.
 * Each validator receives the raw args array and returns an array of issue
 * strings (empty = valid).
 */
const validators: Record<string, Validator> = {
  // ── API / Stream ────────────────────────────────────────
  "api:request": (args) => {
    const issues: string[] = [];
    if (!isObject(args[0])) {
      issues.push("args[0] must be an object");
      return issues;
    }
    const a = args[0] as Record<string, unknown>;
    if (!isValidHttpUrl(a.baseUrl)) issues.push("baseUrl must be a valid http/https URL");
    if (!isAllowedPath(a.path)) issues.push("path must start with / and not contain ..");
    if (a.method !== undefined && !isEnum(a.method, API_METHODS))
      issues.push("method must be one of GET, POST, PATCH, DELETE");
    if (a.timeoutMs !== undefined && !isNumber(a.timeoutMs))
      issues.push("timeoutMs must be a finite number");
    if (a.timeoutMs !== undefined && isNumber(a.timeoutMs) && a.timeoutMs <= 0)
      issues.push("timeoutMs must be positive");
    return issues;
  },

  "stream:subscribe": (args) => {
    const issues: string[] = [];
    if (!isObject(args[0])) {
      issues.push("args[0] must be an object");
      return issues;
    }
    const a = args[0] as Record<string, unknown>;
    if (!isNonEmptyString(a.subId)) issues.push("subId must be a non-empty string");
    if (!isValidHttpUrl(a.baseUrl)) issues.push("baseUrl must be a valid http/https URL");
    if (!isAllowedPath(a.path)) issues.push("path must start with / and not contain ..");
    return issues;
  },

  "stream:unsubscribe": (args) => {
    const issues: string[] = [];
    if (!isNonEmptyString(args[0])) issues.push("subId must be a non-empty string");
    return issues;
  },

  // ── Config ──────────────────────────────────────────────
  "config:getEnvironments": () => [],

  "config:addEnvironment": (args) => {
    const issues: string[] = [];
    if (!isNonEmptyString(args[0]) || (args[0] as string).length > 256)
      issues.push("name must be a non-empty string (max 256 chars)");
    if (!isValidHttpUrl(args[1])) issues.push("url must be a valid http/https URL");
    if (args[2] !== undefined && !isEnum(args[2], ENDPOINT_KINDS))
      issues.push("kind must be one of direct, ssh, tailscale");
    return issues;
  },

  "config:exchangePairingCode": (args) => {
    const issues: string[] = [];
    if (!isValidHttpUrl(args[0])) issues.push("baseUrl must be a valid http/https URL");
    if (!isNonEmptyString(args[1])) issues.push("code must be a non-empty string");
    if (args[2] !== undefined && !isEnum(args[2], SESSION_SCOPES))
      issues.push("scope must be one of read-only, operate, admin");
    return issues;
  },

  "config:removeSessionToken": (args) => {
    const issues: string[] = [];
    if (!isNonEmptyString(args[0])) issues.push("environmentId must be a non-empty string");
    return issues;
  },

  "config:removeEnvironment": (args) => {
    const issues: string[] = [];
    if (!isNonEmptyString(args[0])) issues.push("id must be a non-empty string");
    return issues;
  },

  "config:addEndpoint": (args) => {
    const issues: string[] = [];
    if (!isNonEmptyString(args[0])) issues.push("environmentId must be a non-empty string");
    if (!isValidHttpUrl(args[1])) issues.push("url must be a valid http/https URL");
    if (!isEnum(args[2], ENDPOINT_KINDS))
      issues.push("kind must be one of direct, ssh, tailscale");
    return issues;
  },

  "config:removeEndpoint": (args) => {
    const issues: string[] = [];
    if (!isNonEmptyString(args[0])) issues.push("environmentId must be a non-empty string");
    if (!isNonEmptyString(args[1])) issues.push("endpointId must be a non-empty string");
    return issues;
  },

  "config:setActiveEndpoint": (args) => {
    const issues: string[] = [];
    if (!isNonEmptyString(args[0])) issues.push("environmentId must be a non-empty string");
    if (!isNonEmptyString(args[1])) issues.push("endpointId must be a non-empty string");
    return issues;
  },

  "config:getSelectedEnvironmentId": () => [],

  "config:setSelectedEnvironmentId": (args) => {
    const issues: string[] = [];
    if (args[0] !== null && !isNonEmptyString(args[0]))
      issues.push("id must be a non-empty string or null");
    return issues;
  },

  "config:migrateFromLocalStorage": (args) => {
    const issues: string[] = [];
    if (!isNonEmptyString(args[0])) issues.push("rawInstances must be a non-empty string");
    if (args[1] !== null && !isNonEmptyString(args[1]))
      issues.push("rawSelectedId must be a non-empty string or null");
    return issues;
  },

  // ── Connection ──────────────────────────────────────────
  "connection:getStatus": (args) => {
    const issues: string[] = [];
    if (!isNonEmptyString(args[0])) issues.push("environmentId must be a non-empty string");
    return issues;
  },

  "connection:getEndpointHealth": (args) => {
    const issues: string[] = [];
    if (!isNonEmptyString(args[0])) issues.push("environmentId must be a non-empty string");
    return issues;
  },

  "connection:retry": (args) => {
    const issues: string[] = [];
    if (!isNonEmptyString(args[0])) issues.push("environmentId must be a non-empty string");
    return issues;
  },

  "connection:networkChanged": (args) => {
    const issues: string[] = [];
    if (!isBoolean(args[0])) issues.push("online must be a boolean");
    return issues;
  },

  // ── Tailscale ───────────────────────────────────────────
  "tailscale:peers": () => [],

  // ── VM Wizard ───────────────────────────────────────────
  "vmWizard:listSshHosts": () => [],

  "vmWizard:start": (args) => {
    const issues: string[] = [];
    const target = args[0];
    if (!isString(target) || target.length === 0 || target.length > 512) {
      issues.push("target must be a string (1–512 chars)");
    } else if (/[\x00-\x1f`$\\;"'&|<>(){}!\n\r]/.test(target)) {
      issues.push("target contains disallowed characters");
    }
    if (args[1] !== undefined && !isString(args[1]))
      issues.push("name must be a string if provided");
    return issues;
  },

  "vmWizard:cancel": () => [],

  "vmWizard:respondConsent": (args) => {
    const issues: string[] = [];
    if (!isEnum(args[0], CONSENT_DECISIONS))
      issues.push("decision must be 'install' or 'skip'");
    return issues;
  },

  "vmWizard:respondServiceSelection": (args) => {
    const issues: string[] = [];
    if (!isObject(args[0])) {
      issues.push("selection must be an object");
      return issues;
    }
    const sel = args[0] as Record<string, unknown>;
    for (const key of SERVICE_SELECTION_KEYS) {
      if (sel[key] !== undefined && !isBoolean(sel[key])) {
        issues.push(`${key} must be a boolean`);
      }
    }
    return issues;
  },

  // ── OpenCode ────────────────────────────────────────────
  "opencode:getStatus": (args) => {
    const issues: string[] = [];
    if (!isNonEmptyString(args[0])) issues.push("environmentId must be a non-empty string");
    return issues;
  },

  "opencode:refreshStatus": (args) => {
    const issues: string[] = [];
    if (!isNonEmptyString(args[0])) issues.push("environmentId must be a non-empty string");
    return issues;
  },

  "config:setOpenCodeEndpoint": (args) => {
    const issues: string[] = [];
    if (!isNonEmptyString(args[0])) issues.push("environmentId must be a non-empty string");
    const ep = args[1];
    if (ep !== null) {
      if (!isObject(ep)) {
        issues.push("endpoint must be an object or null");
      } else {
        if (!isNonEmptyString(ep.url)) issues.push("endpoint.url must be a non-empty string");
        if (ep.password !== null && !isString(ep.password))
          issues.push("endpoint.password must be a string or null");
      }
    }
    return issues;
  },

  "config:setMainVm": (args) => {
    const issues: string[] = [];
    if (!isNonEmptyString(args[0])) issues.push("environmentId must be a non-empty string");
    return issues;
  },

  "config:getMainVmId": () => [],

  // ── Infra ───────────────────────────────────────────────
  "infra:executeAction": (args) => {
    const issues: string[] = [];
    if (!isObject(args[0])) {
      issues.push("args must be an object");
      return issues;
    }
    const a = args[0] as Record<string, unknown>;
    if (!isEnum(a.action, INFRA_ACTIONS))
      issues.push("action must be 'machine-status' or 'clone-repo'");
    if (a.params !== undefined && !isObject(a.params))
      issues.push("params must be an object if provided");
    if (a.action === "clone-repo") {
      const params = a.params as Record<string, unknown> | undefined;
      if (!params || !isNonEmptyString(params.repoUrl))
        issues.push("params.repoUrl is required for clone-repo");
    }
    return issues;
  },

  "infra:getStatus": () => [],
};

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Validate IPC handler arguments against the registered schema for `channel`.
 *
 * - Returns the validated args array (pass-through, for ergonomics).
 * - Throws `IpcValidationError` on failure — the caller should catch it and
 *   return a structured error to the renderer.
 *
 * Usage:
 * ```ts
 * ipcMain.handle("foo", (_event, ...rawArgs) => {
 *   const args = validateIpc("foo", rawArgs); // throws on invalid input
 *   // ... safe to use args ...
 * });
 * ```
 */
export function validateIpc<T = unknown[]>(channel: string, args: unknown[]): T {
  const validator = validators[channel];
  if (!validator) {
    // Channel not registered — this is a programming error, not a renderer issue.
    // We still throw but with a clear message for the developer.
    throw new IpcValidationError(channel, [`no validator registered for channel "${channel}"`]);
  }

  const issues = validator(args);
  if (issues.length > 0) {
    throw new IpcValidationError(channel, issues);
  }

  return args as T;
}
