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
  /** SSE transport for communicating with the MCP server. */
  transport: SseTransport;
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

// ── MCP SSE transport ────────────────────────────────────────────────────

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

/**
 * MCP SSE transport session — maintains an SSE connection for receiving
 * responses and a POST endpoint for sending requests.
 */
interface SseTransport {
  /** The POST endpoint URL the server tells us to send messages to. */
  postEndpoint: string | null;
  /** Pending requests waiting for responses, keyed by JSON-RPC id. */
  pending: Map<number, { resolve: (r: JsonRpcResponse) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>;
  /** The SSE reader, kept alive so responses can arrive. */
  controller: AbortController | null;
  /** Whether the transport has been shut down. */
  closed: boolean;
}

/**
 * Perform a single JSON-RPC request over the MCP SSE transport.
 *
 * The SSE transport works in two phases:
 * 1. On connect, open a GET stream to /sse. The server sends an `endpoint`
 *    event with a URL to POST messages to.
 * 2. For each request, POST the JSON-RPC body to that endpoint and wait
 *    for the response to arrive on the SSE stream.
 */
async function sseRpcRequest(
  transport: SseTransport,
  _baseUrl: string,
  method: string,
  params?: unknown,
  timeoutMs: number = MCP_TIMEOUT_MS,
): Promise<JsonRpcResponse> {
  if (!transport.postEndpoint) {
    throw new Error("SSE transport not ready: no POST endpoint received yet");
  }

  const id = Math.floor(Math.random() * 1_000_000) + 1;
  const body = {
    jsonrpc: "2.0",
    id,
    method,
    ...(params !== undefined ? { params } : {}),
  };

  return new Promise<JsonRpcResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      transport.pending.delete(id);
      reject(new Error(`MCP request '${method}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    transport.pending.set(id, { resolve, reject, timer });

    const postUrl = transport.postEndpoint!;

    fetch(postUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch((err) => {
      transport.pending.delete(id);
      clearTimeout(timer);
      reject(new Error(`Failed to POST MCP request: ${err instanceof Error ? err.message : String(err)}`));
    });
  });
}

/**
 * Connect the SSE transport: open a GET stream to /sse and wait for
 * the server to send the `endpoint` event with the POST URL.
 */
async function connectSseTransport(transport: SseTransport, baseUrl: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transport.controller = new AbortController();
    const timeout = setTimeout(() => {
      if (!transport.postEndpoint) {
        transport.controller?.abort();
        reject(new Error("Timed out waiting for MCP SSE endpoint event"));
      }
    }, MCP_TIMEOUT_MS);

    fetch(`${baseUrl}/sse`, {
      method: "GET",
      headers: { Accept: "text/event-stream" },
      signal: transport.controller.signal,
    }).then(async (res) => {
      if (!res.ok || !res.body) {
        clearTimeout(timeout);
        reject(new Error(`MCP SSE endpoint returned HTTP ${res.status}`));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      const processLine = (line: string): void => {
        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith("data:") && currentEvent === "endpoint") {
          const data = line.slice(5).trim();
          transport.postEndpoint = data.startsWith("http")
            ? data
            : `${baseUrl}${data.startsWith("/") ? "" : "/"}${data}`;
          clearTimeout(timeout);
          resolve();
        } else if (line === "") {
          // Event boundary
          currentEvent = "";

          // Check if this is a JSON-RPC response (data line in a "message" event)
          // We handle responses in the data accumulation below
        }
      };

      const processData = (data: string): void => {
        // Try to parse as JSON-RPC response
        try {
          const parsed = JSON.parse(data) as JsonRpcResponse;
          if (parsed.jsonrpc === "2.0" && typeof parsed.id === "number") {
            const pending = transport.pending.get(parsed.id);
            if (pending) {
              clearTimeout(pending.timer);
              transport.pending.delete(parsed.id);
              pending.resolve(parsed);
            }
          }
        } catch {
          // Not JSON, ignore — might be a keepalive or other event
        }
      };

      (async () => {
        try {
          while (!transport.closed) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            let dataBuffer = "";
            for (const line of lines) {
              if (line.startsWith("data:")) {
                dataBuffer += line.slice(5).trim();
              } else if (line === "" && dataBuffer) {
                processData(dataBuffer);
                dataBuffer = "";
              }
              processLine(line);
            }
          }
        } catch (err) {
          if (!transport.closed) {
            // Stream closed unexpectedly — reject all pending
            for (const [, pending] of transport.pending) {
              clearTimeout(pending.timer);
              pending.reject(new Error("SSE stream closed unexpectedly"));
            }
            transport.pending.clear();
          }
        }
      })();
    }).catch((err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to connect to MCP SSE: ${err instanceof Error ? err.message : String(err)}`));
    });
  });
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
      transport: {
        postEndpoint: null,
        pending: new Map(),
        controller: null,
        closed: false,
      },
    };
    sessions.set(environmentId, session);
    broadcastStatus(session);
  }

  try {
    const session = getSession(environmentId)!;

    // 1. Connect SSE transport and wait for the server's endpoint event
    await connectSseTransport(session.transport, baseUrl);

    // 2. Initialize handshake
    const initResult = await sseRpcRequest(
      session.transport,
      baseUrl,
      "initialize",
      {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "orbion",
          version: "0.1.0",
        },
      },
    );

    if (initResult.error) {
      updateSession(environmentId, {
        state: "error",
        lastError: msg("mcp.initFailed", { detail: initResult.error.message }),
      });
      return statusFromSession(getSession(environmentId)!);
    }

    // 3. Discover available tools
    const toolsResult = await sseRpcRequest(
      session.transport,
      baseUrl,
      "tools/list",
      {},
    );

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

  // Close the SSE transport
  session.transport.closed = true;
  session.transport.controller?.abort();
  session.transport.pending.clear();

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
    const result = await sseRpcRequest(
      session.transport,
      session.baseUrl,
      "tools/call",
      {
        name: toolName,
        arguments: args,
      },
    );

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
  const session = sessions.get(environmentId);
  if (session) {
    session.transport.closed = true;
    session.transport.controller?.abort();
    session.transport.pending.clear();
  }
  sessions.delete(environmentId);
}
