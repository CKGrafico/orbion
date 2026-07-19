/**
 * Agent streaming client for the OpenCode runtime.
 *
 * Uses the OpenCode SDK v2's session.promptAsync + v2.session.events SSE
 * stream to send prompts, receive token-by-token text deltas, and interrupt
 * running generations. All network I/O stays in the main process; events are
 * forwarded to the renderer via IPC push (agent:streamEvent).
 *
 * Architecture:
 * - Each in-flight prompt is tracked by a composite key
 *   (environmentId + chatSessionId + turnId) so the renderer can correlate
 *   stream events back to the correct turn.
 * - The OpenCode SSE event stream is consumed via the same spec-compliant
 *   eventsource-parser used for log streaming.
 * - Aborting is done via OpenCode's v2.session.interrupt endpoint.
 */

import type {
  AgentSendPromptArgs,
  AgentSendPromptResult,
  AgentStreamEvent,
  OpenCodeEndpoint,
} from "../shared/ipc.js";
import { msg } from "./i18n.js";
import { getEnvironments } from "./config-store.js";
import { getMainWindow } from "./main-window.js";
import { trimTrailingSlash } from "../shared/utils.js";
import { decryptValue } from "./config-store.js";

// ── Types ────────────────────────────────────────────────────────────────

/** Timeout for the promptAsync HTTP request. */
const PROMPT_TIMEOUT_MS = 30_000;

/** Timeout for the interrupt HTTP request. */
const INTERRUPT_TIMEOUT_MS = 10_000;

interface InFlightPrompt {
  environmentId: string;
  chatSessionId: string;
  turnId: string;
  opencodeSessionId: string;
  abortController: AbortController;
}

// ── In-memory tracking ────────────────────────────────────────────────────

const inFlight = new Map<string, InFlightPrompt>();

function inFlightKey(chatSessionId: string, turnId: string): string {
  return `${chatSessionId}:${turnId}`;
}

// ── Event forwarding ────────────────────────────────────────────────────

function forwardEvent(event: AgentStreamEvent): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send("agent:streamEvent", event);
  }
}

// ── OpenCode HTTP helpers ────────────────────────────────────────────────

/** Resolve the OpenCode endpoint for an environment. */
function resolveOpenCodeEndpoint(environmentId: string): { url: string; password: string | null; wasEncrypted: boolean } | null {
  const envs = getEnvironments();
  const env = envs.find((e) => e.id === environmentId);
  if (!env?.opencode) return null;

  const endpoint = env.opencode as OpenCodeEndpoint;
  let password: string | null = null;

  const endpointAny = endpoint as unknown as Record<string, unknown>;

  if (endpoint.password) {
    if (endpointAny.wasEncrypted) {
      const decrypted = decryptValue(endpoint.password);
      if (decrypted) password = decrypted;
    } else {
      password = endpoint.password;
    }
  }

  return { url: endpoint.url, password, wasEncrypted: endpointAny.wasEncrypted === true };
}

/** Build auth headers for OpenCode API requests. */
function buildAuthHeaders(password: string | null): Record<string, string> {
  if (!password) return {};
  const encoded = Buffer.from(`admin:${password}`).toString("base64");
  return { Authorization: `Basic ${encoded}` };
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Send a prompt to the OpenCode runtime and begin streaming events.
 *
 * This performs:
 * 1. Resolve the environment's OpenCode endpoint.
 * 2. POST promptAsync to create/continue a session.
 * 3. Consume the v2.session.events SSE stream, forwarding text-delta and
 *    other events to the renderer.
 * 4. Clean up on finish/error/abort.
 */
export async function sendPromptToAgent(
  args: AgentSendPromptArgs,
): Promise<AgentSendPromptResult> {
  const endpointInfo = resolveOpenCodeEndpoint(args.environmentId);
  if (!endpointInfo) {
    return { ok: false, error: msg("agent.noEndpoint") };
  }

  const baseUrl = trimTrailingSlash(endpointInfo.url.trim());
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...buildAuthHeaders(endpointInfo.password),
  };

  const controller = new AbortController();
  const key = inFlightKey(args.chatSessionId, args.turnId);

  try {
    // Step 1: Create or resume session + send prompt asynchronously
    const promptBody: Record<string, unknown> = {
      prompt: args.prompt,
    };
    if (args.sessionId) {
      promptBody.sessionID = args.sessionId;
    }
    if (args.model) {
      promptBody.model = args.model;
    }
    if (args.reasoningEffort) {
      promptBody.reasoningEffort = args.reasoningEffort;
    }

    const promptTimeout = setTimeout(() => controller.abort(), PROMPT_TIMEOUT_MS);

    const promptRes = await fetch(`${baseUrl}/session/prompt`, {
      method: "POST",
      headers,
      body: JSON.stringify(promptBody),
      signal: controller.signal,
    });

    clearTimeout(promptTimeout);

    if (!promptRes.ok) {
      const errText = await promptRes.text().catch(() => "");
      return {
        ok: false,
        error: msg("agent.promptFailed", { status: String(promptRes.status), detail: errText.slice(0, 200) }),
      };
    }

    const promptData = await promptRes.json() as Record<string, unknown>;
    const opencodeSessionId = String(promptData.sessionID ?? promptData.id ?? args.sessionId ?? "");

    // Track in-flight prompt
    const entry: InFlightPrompt = {
      environmentId: args.environmentId,
      chatSessionId: args.chatSessionId,
      turnId: args.turnId,
      opencodeSessionId,
      abortController: controller,
    };
    inFlight.set(key, entry);

    // Step 2: Connect to the SSE event stream for this session
    const eventsPath = args.sessionId
      ? `/v2/session/events?sessionID=${encodeURIComponent(opencodeSessionId)}`
      : `/v2/session/events?sessionID=${encodeURIComponent(opencodeSessionId)}`;

    // Fire-and-forget the SSE stream consumption
    void consumeEventStream(
      baseUrl,
      eventsPath,
      headers,
      controller,
      args.chatSessionId,
      args.turnId,
    );

    return { ok: true, sessionId: opencodeSessionId };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      forwardEvent({ kind: "turn-interrupted", chatSessionId: args.chatSessionId, turnId: args.turnId });
      return { ok: false, error: msg("agent.promptTimedOut") };
    }

    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg("agent.promptError", { detail: message }) };
  }
}

/**
 * Consume the SSE event stream from the OpenCode runtime.
 *
 * Parses incoming events and forwards relevant ones to the renderer.
 * Handles text deltas, tool calls, and session completion.
 */
async function consumeEventStream(
  baseUrl: string,
  eventsPath: string,
  headers: Record<string, string>,
  controller: AbortController,
  chatSessionId: string,
  turnId: string,
): Promise<void> {
  const key = inFlightKey(chatSessionId, turnId);

  try {
    const streamHeaders = { ...headers, Accept: "text/event-stream" };
    const res = await fetch(`${baseUrl}${eventsPath}`, {
      signal: controller.signal,
      headers: streamHeaders,
    });

    if (!res.ok || !res.body) {
      forwardEvent({ kind: "turn-error", chatSessionId, turnId, error: `HTTP ${res.status}` });
      return;
    }

    // Parse the SSE stream
    const decoder = new TextDecoder();
    const reader = res.body.getReader();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const event = JSON.parse(data) as Record<string, unknown>;
            forwardParsedEvent(event, chatSessionId, turnId);
          } catch {
            // Not JSON — skip
          }
        }
      }
    }

    // Stream ended naturally
    forwardEvent({ kind: "turn-finished", chatSessionId, turnId });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      forwardEvent({ kind: "turn-interrupted", chatSessionId, turnId });
    } else {
      const message = err instanceof Error ? err.message : String(err);
      forwardEvent({ kind: "turn-error", chatSessionId, turnId, error: message });
    }
  } finally {
    inFlight.delete(key);
  }
}

/**
 * Parse and forward a single OpenCode SSE event to the renderer.
 *
 * The OpenCode runtime emits various event types. We only forward the ones
 * relevant to the chat UI: text content updates, tool calls, and completion.
 */
function forwardParsedEvent(
  event: Record<string, unknown>,
  chatSessionId: string,
  turnId: string,
): void {
  const eventType = String(event.type ?? event.kind ?? "");

  // Text content delta from the assistant
  if (eventType === "part-update" || eventType === "text-delta") {
    const text = String(event.text ?? event.content ?? "");
    if (text) {
      forwardEvent({ kind: "text-delta", chatSessionId, turnId, text });
    }
    return;
  }

  // Tool call started
  if (eventType === "tool-call-start" || eventType === "tool-start") {
    const toolCallId = String(event.id ?? event.toolCallId ?? `tc-${Date.now()}`);
    const toolName = String(event.name ?? event.toolName ?? "unknown");
    const title = String(event.title ?? toolName);
    forwardEvent({ kind: "tool-call-start", chatSessionId, turnId, toolCallId, toolName, title });
    return;
  }

  // Tool call completed / errored
  if (eventType === "tool-call-end" || eventType === "tool-end") {
    const toolCallId = String(event.id ?? event.toolCallId ?? "");
    const output = String(event.output ?? event.result ?? "");
    const exitCode = event.exitCode ?? event.code;
    const status = exitCode !== undefined && Number(exitCode) !== 0 ? "error" : "completed";
    forwardEvent({ kind: "tool-call-output", chatSessionId, turnId, toolCallId, output, status });
    return;
  }

  // Session completed / agent turn finished
  if (eventType === "session-complete" || eventType === "turn-complete" || eventType === "response-done") {
    forwardEvent({ kind: "turn-finished", chatSessionId, turnId });
    return;
  }

  // Error
  if (eventType === "error") {
    const error = String(event.error ?? event.message ?? "Unknown error");
    forwardEvent({ kind: "turn-error", chatSessionId, turnId, error });
    return;
  }
}

/**
 * Interrupt an in-flight agent generation.
 *
 * Sends an interrupt signal to the OpenCode runtime and aborts the
 * local SSE stream consumer. Partial output is preserved in the transcript.
 */
export async function interruptAgent(
  environmentId: string,
  sessionId?: string,
): Promise<void> {
  // Find and abort any in-flight prompt for this environment
  for (const [key, entry] of inFlight) {
    if (entry.environmentId === environmentId) {
      entry.abortController.abort();
      inFlight.delete(key);
    }
  }

  // Also send interrupt to the OpenCode runtime
  if (!sessionId) return;

  const endpointInfo = resolveOpenCodeEndpoint(environmentId);
  if (!endpointInfo) return;

  const baseUrl = trimTrailingSlash(endpointInfo.url.trim());
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...buildAuthHeaders(endpointInfo.password),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INTERRUPT_TIMEOUT_MS);

  try {
    await fetch(`${baseUrl}/v2/session/interrupt`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sessionID: sessionId }),
      signal: controller.signal,
    });
  } catch {
    // Best-effort: if the interrupt fails, we still aborted locally
  } finally {
    clearTimeout(timeout);
  }
}
