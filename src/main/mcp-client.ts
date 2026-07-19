/**
 * MCP client for the loop-task daemon's MCP server.
 *
 * The loop-task daemon (>= 2.1) exposes an MCP server alongside its HTTP API,
 * defaulting to port 8846. This module discovers available tools at runtime
 * (never hard-coding or inventing tool names) and routes tool calls through
 * the main process so the sandboxed renderer cannot reach the network directly.
 *
 * Architecture:
 * - Each connected environment has its own MCP session (tools + connection state).
 * - The MCP endpoint is derived from the environment's active endpoint URL:
 *   same host, port 8846 (configurable via the daemon's MCP_HTTP_PORT).
 * - For SSH endpoints, the MCP port is forwarded through the same tunnel as
 *   the HTTP API, so the effective URL already resolves to localhost.
 * - Tool calls that fail are surfaced as readable error messages in the chat,
 *   never as silent no-ops.
 */

import type { I18nMessage, McpConnectionState, McpConnectionStatus, McpToolCallResult, McpToolInfo } from "../shared/ipc.js";
import { msg } from "./i18n.js";
import { trimTrailingSlash } from "../shared/utils.js";
import { resolveEffectiveUrl } from "./tunnel-registry.js";
import { getEnvironments } from "./config-store.js";
import { getMainWindow } from "./main-window.js";

// ── Types ────────────────────────────────────────────────────────────────

/** Default MCP port on the loop-task daemon. */
const DEFAULT_MCP_PORT = 8846;

/** Timeout for MCP HTTP requests (tool discovery + tool calls). */
const MCP_TIMEOUT_MS = 15_000;

interface McpSession {
  environmentId: string;
  baseUrl: string;
  state: McpConnectionState;
  tools: McpToolInfo[];
  lastError: string | I18nMessage | null;
  connectedAt: number | null;
  /** Per-session monotonic counter for JSON-RPC request IDs, avoiding cross-session collisions. */
  nextRpcId: number;
}

// ── In-memory sessions ────────────────────────────────────────────────────

const sessions = new Map<string, McpSession>();

function getSession(environmentId: string): McpSession | undefined {
  return sessions.get(environmentId);
}

function updateSession(environmentId: string, patch: Partial<McpSession>): void {
  const existing = sessions.get(environmentId);
  if (!existing) return;
  Object.assign(existing, patch);
  broadcastStatus(existing);
}

function broadcastStatus(session: McpSession): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send("mcp:status", statusFromSession(session));
  }
}

function statusFromSession(session: McpSession): McpConnectionStatus {
  return {
    environmentId: session.environmentId,
    state: session.state,
    tools: [...session.tools],
    lastError: session.lastError,
    connectedAt: session.connectedAt,
  };
}

// ── URL derivation ────────────────────────────────────────────────────────

/**
 * Derive the MCP base URL from an environment's active endpoint.
 *
 * The MCP server runs on the same host as the HTTP API, but on port 8846
 * (or whatever the daemon's MCP_HTTP_PORT is set to). Because the renderer
 * only knows the HTTP API URL, we derive the MCP URL here.
 *
 * For SSH endpoints, `resolveEffectiveUrl` already maps the remote host:port
 * to a local forwarded port; we keep the same host but replace the port.
 */
function deriveMcpBaseUrl(environmentId: string): string | null {
  const envs = getEnvironments();
  const env = envs.find((e) => e.id === environmentId);
  if (!env) return null;

  const activeEp = env.activeEndpointId
    ? env.endpoints.find((e) => e.id === env.activeEndpointId)
    : env.endpoints[0];
  if (!activeEp) return null;

  // Resolve through tunnel registry for SSH endpoints
  const effectiveUrl = resolveEffectiveUrl(environmentId, activeEp);
  if (!effectiveUrl) return null;

  try {
    const parsed = new URL(effectiveUrl);
    parsed.port = String(DEFAULT_MCP_PORT);
    return trimTrailingSlash(parsed.toString());
  } catch {
    return null;
  }
}

// ── JSON-RPC over HTTP ────────────────────────────────────────────────────

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

async function rpcRequest(
  session: McpSession,
  method: string,
  params?: unknown,
): Promise<JsonRpcResponse> {
  const id = session.nextRpcId++;
  const body = {
    jsonrpc: "2.0",
    id,
    method,
    ...(params !== undefined ? { params } : {}),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MCP_TIMEOUT_MS);

  try {
    const res = await fetch(`${session.baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `MCP server returned HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
      );
    }

    const data = (await res.json()) as JsonRpcResponse;
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Get the current MCP connection status for an environment.
 * Returns a "disconnected" status if no session exists yet.
 */
export function getMcpStatus(environmentId: string): McpConnectionStatus {
  const session = getSession(environmentId);
  if (session) return statusFromSession(session);

  return {
    environmentId,
    state: "unreachable",
    tools: [],
    lastError: null,
    connectedAt: null,
  };
}

/**
 * Connect (or reconnect) to an environment's MCP server.
 *
 * This performs:
 * 1. Derive the MCP base URL from the environment's active endpoint.
 * 2. Send `initialize` + `tools/list` JSON-RPC requests.
 * 3. On success, store the discovered tools and mark as connected.
 * 4. On failure, mark as unreachable/error with a readable message.
 */
export async function connectMcp(environmentId: string): Promise<McpConnectionStatus> {
  // Create or reset session
  const existing = getSession(environmentId);
  const baseUrl = deriveMcpBaseUrl(environmentId);
  if (!baseUrl) {
    const status: McpConnectionStatus = {
      environmentId,
      state: "error",
      tools: [],
      lastError: msg("mcp.noEndpoint"),
      connectedAt: null,
    };
    return status;
  }

  // Mark as connecting
  if (existing) {
    updateSession(environmentId, { state: "connecting", lastError: null });
  } else {
    const session: McpSession = {
      environmentId,
      baseUrl,
      state: "connecting",
      tools: [],
      lastError: null,
      connectedAt: null,
      nextRpcId: 1,
    };
    sessions.set(environmentId, session);
    broadcastStatus(session);
  }

  try {
    const session = getSession(environmentId)!;

    // 1. Initialize handshake
    const initResult = await rpcRequest(session, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "orbion",
        version: "0.1.0",
      },
    });

    if (initResult.error) {
      updateSession(environmentId, {
        state: "error",
        lastError: msg("mcp.initFailed", { detail: initResult.error.message }),
      });
      return statusFromSession(getSession(environmentId)!);
    }

    // 2. Discover available tools
    const toolsResult = await rpcRequest(session, "tools/list", {});

    if (toolsResult.error) {
      updateSession(environmentId, {
        state: "error",
        lastError: msg("mcp.toolsDiscoveryFailed", { detail: toolsResult.error.message }),
      });
      return statusFromSession(getSession(environmentId)!);
    }

    const toolsData = toolsResult.result as { tools?: Array<{ name: string; description?: string; inputSchema?: unknown }> } | undefined;
    const tools: McpToolInfo[] = (toolsData?.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));

    // 3. Mark connected
    const now = Date.now();
    updateSession(environmentId, {
      state: "connected",
      tools,
      lastError: null,
      connectedAt: now,
      baseUrl,
    });

    return statusFromSession(getSession(environmentId)!);
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? msg("mcp.connectionTimedOut")
        : err instanceof Error
          ? err.message
          : String(err);

    // Classify error
    const lower = message.toLowerCase();
    const state: McpConnectionState =
      lower.includes("econnrefused") ||
      lower.includes("enotfound") ||
      lower.includes("enetunreach") ||
      lower.includes("timed out") ||
      lower.includes("abort")
        ? "unreachable"
        : "error";

    updateSession(environmentId, {
      state,
      lastError: msg("mcp.connectionFailed", { detail: message }),
    });

    return statusFromSession(getSession(environmentId)!);
  }
}

/**
 * Disconnect an environment's MCP client.
 * Clears tools and marks as unreachable.
 */
export async function disconnectMcp(environmentId: string): Promise<void> {
  const session = getSession(environmentId);
  if (!session) return;

  session.state = "unreachable";
  session.tools = [];
  session.connectedAt = null;
  session.lastError = null;
  broadcastStatus(session);
}

/**
 * Call an MCP tool on an environment's daemon.
 *
 * The tool name must come from the tools advertised by `getMcpStatus().tools`.
 * Results and errors are surfaced via `McpToolCallResult` — never thrown.
 */
export async function callMcpTool(
  environmentId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<McpToolCallResult> {
  const session = getSession(environmentId);

  // No session or not connected
  if (!session || session.state !== "connected") {
    return {
      ok: false,
      error: msg("mcp.notConnected"),
    };
  }

  // Validate tool name against discovered tools
  const known = session.tools.some((t) => t.name === toolName);
  if (!known) {
    return {
      ok: false,
      error: msg("mcp.unknownTool", { tool: toolName }),
    };
  }

  try {
    const result = await rpcRequest(session, "tools/call", {
      name: toolName,
      arguments: args,
    });

    if (result.error) {
      return {
        ok: false,
        error: msg("mcp.toolCallFailed", { tool: toolName, detail: result.error.message }),
      };
    }

    return {
      ok: true,
      data: result.result,
    };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? msg("mcp.toolCallTimedOut", { tool: toolName }).toString()
        : err instanceof Error
          ? err.message
          : String(err);

    return {
      ok: false,
      error: msg("mcp.toolCallError", { tool: toolName, detail: message }),
    };
  }
}

/**
 * Remove an MCP session when an environment is removed.
 */
export function removeMcpSession(environmentId: string): void {
  sessions.delete(environmentId);
}
