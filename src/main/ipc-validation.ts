/**
 * IPC Input Validation — runtime boundary checks for ipcMain.handle() channels.
 *
 * TypeScript annotations on IPC handler args are compile-time only. At runtime,
 * a compromised renderer can send any value. This module validates every argument
 * before it reaches business logic, returning structured errors on failure.
 *
 * No external dependencies — manual validation only.
 */

import { ipcMain } from "electron";

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

export function isAllowedPath(v: unknown): v is string {
  if (!isString(v)) return false;
  // Must start with /api/ — only API paths are valid targets
  if (!v.startsWith("/api/")) return false;
  // Reasonable length limit to prevent abuse
  if (v.length > 512) return false;
  // Decode to catch URL-encoded traversal (%2e%2e → ..)
  try {
    const decoded = decodeURIComponent(v);
    if (decoded.includes("..")) return false;
  } catch {
    return false; // malformed encoding
  }
  // Reject raw encoded dot forms (%2e, %2E) and double-encoding (%25)
  if (/%2e/i.test(v)) return false;
  if (/%25/i.test(v)) return false;
  return true;
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

// ── Shared validator factories ────────────────────────────────────────

type Validator = (args: unknown[]) => string[];

/**
 * Validator for `config:setOpenCodeEndpoint` and `config:setInfraOpenCodeEndpoint`.
 * Both channels accept identical arguments: (environmentId, endpoint | null).
 * A shared factory prevents security drift — any new validation rule is applied
 * to both channels automatically.
 */
function makeOpenCodeEndpointValidator(): Validator {
  return (args) => {
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
  };
}

// ── Per-channel validators ────────────────────────────────────────────

const ENDPOINT_KINDS = ["direct", "ssh", "tailscale"] as const;
const SESSION_SCOPES = ["read-only", "operate", "admin"] as const;
const API_METHODS = ["GET", "POST", "PATCH", "DELETE"] as const;
const INFRA_ACTIONS = ["machine-status", "clone-repo", "create-issue", "detect-platform", "list-issues", "add-label"] as const;
const CONSENT_DECISIONS = ["install", "skip"] as const;
const AGENT_RUNTIMES = ["opencode", "claude"] as const;
const REACH_METHODS = ["local", "ssh"] as const;
const MAX_PASSPHRASE_LENGTH = 4096;

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
    if (!isAllowedPath(a.path)) issues.push("path must start with /api/ and not contain path traversal or encoded sequences");
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
    if (!isAllowedPath(a.path)) issues.push("path must start with /api/ and not contain path traversal or encoded sequences");
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
    if (args.length !== 1 || !isObject(args[0])) {
      issues.push("exactly one options object is required");
      return issues;
    }
    const options = args[0];
    const reachMethod = options.reachMethod ?? "ssh";
    if (!isEnum(options.agentRuntime, AGENT_RUNTIMES))
      issues.push("agentRuntime must be one of opencode, claude");
    if (options.reachMethod !== undefined && !isEnum(options.reachMethod, REACH_METHODS))
      issues.push("reachMethod must be one of local, ssh");
    if (options.name !== undefined && (!isString(options.name) || options.name.length > 256))
      issues.push("name must be a string (max 256 chars) if provided");
    if (options.directUrl !== undefined && (!isValidHttpUrl(options.directUrl) || options.directUrl.length > 2048))
      issues.push("directUrl must be a valid http/https URL (max 2048 chars) if provided");
    if (reachMethod === "local" && options.directUrl === undefined)
      issues.push("directUrl is required for local reach method");
    if (reachMethod === "ssh") {
      const target = options.target;
      if (!isString(target) || target.length === 0 || target.length > 512) {
        issues.push("target must be a string (1-512 chars)");
      } else if (/[\x00-\x1f`$\\;"'&|<>(){}!\n\r]/.test(target)) {
        issues.push("target contains disallowed characters");
      }
    } else if (!isString(options.target)) {
      issues.push("target must be a string");
    }
    if (options.sshKeyPassphrase !== undefined && (!isString(options.sshKeyPassphrase) || options.sshKeyPassphrase.length > MAX_PASSPHRASE_LENGTH))
      issues.push(`sshKeyPassphrase must be a string (max ${MAX_PASSPHRASE_LENGTH} chars) if provided`);
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
    if (!isObject(sel.installTools)) {
      issues.push("installTools must be an object");
    } else {
      const tools = sel.installTools;
      for (const [key, val] of Object.entries(tools)) {
        if (!isBoolean(val)) {
          issues.push(`installTools.${key} must be a boolean`);
        }
      }
    }
    return issues;
  },

  "vmWizard:respondRuntimeConsent": (args) => {
    const issues: string[] = [];
    if (!isEnum(args[0], CONSENT_DECISIONS))
      issues.push("decision must be 'install' or 'skip'");
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

  "config:setOpenCodeEndpoint": makeOpenCodeEndpointValidator(),
  "config:setInfraOpenCodeEndpoint": makeOpenCodeEndpointValidator(),

  "config:setMainVm": (args) => {
    const issues: string[] = [];
    if (!isNonEmptyString(args[0])) issues.push("environmentId must be a non-empty string");
    return issues;
  },

  "config:getMainVmId": () => [],

  "config:getProjectPickupLabels": (args) => {
    const issues: string[] = [];
    if (!isNonEmptyString(args[0])) issues.push("projectId must be a non-empty string");
    return issues;
  },

  "config:setProjectPickupLabels": (args) => {
    const issues: string[] = [];
    if (!isNonEmptyString(args[0])) issues.push("projectId must be a non-empty string");
    if (!Array.isArray(args[1])) {
      issues.push("labels must be an array");
    } else {
      for (let i = 0; i < args[1].length; i++) {
        if (!isString(args[1][i])) {
          issues.push(`labels[${i}] must be a string`);
          break;
        }
      }
    }
    return issues;
  },

  // ── Infra ───────────────────────────────────────────────
  "infra:executeAction": (args) => {
    const issues: string[] = [];
    if (!isObject(args[0])) {
      issues.push("args must be an object");
      return issues;
    }
    const a = args[0] as Record<string, unknown>;
    if (!isEnum(a.action, INFRA_ACTIONS))
      issues.push("action must be a valid infra action");
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

// ── Structured IPC error result ───────────────────────────────────────

/**
 * Shape returned to the renderer when `validateIpc()` rejects input.
 * Every IPC channel can return this as a fallback — check `ok` before
 * reading type-specific fields.
 */
export interface IpcErrorResult {
  ok: false;
  error: string;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Validate IPC handler arguments against the registered schema for `channel`.
 *
 * - Returns the validated args array (pass-through, for ergonomics).
 * - Throws `IpcValidationError` on failure — catch it via `safeHandle()`
 *   to return a structured error to the renderer.
 *
 * Usage:
 * ```ts
 * safeHandle("foo", (_event, ...rawArgs) => {
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

/**
 * Drop-in replacement for `ipcMain.handle()` that catches `IpcValidationError`
 * and returns a structured `{ ok: false, error }` object to the renderer
 * instead of letting the exception propagate as an unhandled rejection.
 *
 * Non-validation errors are re-thrown so they still surface as true failures.
 *
 * Usage:
 * ```ts
 * // Before:
 * ipcMain.handle("api:request", (_event, ...rawArgs) => { ... });
 *
 * // After:
 * safeHandle("api:request", (_event, ...rawArgs) => { ... });
 * ```
 */
export function safeHandle(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown,
): void {
  ipcMain.handle(channel, async (event, ...rawArgs: unknown[]) => {
    try {
      return await handler(event, ...rawArgs);
    } catch (err) {
      if (err instanceof IpcValidationError) {
        return { ok: false, error: err.message } satisfies IpcErrorResult;
      }
      throw err; // re-throw unexpected errors
    }
  });
}
