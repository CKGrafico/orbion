/**
 * Agent streaming client for the OpenCode runtime.
 *
 * Uses the OpenCode SDK v2's session.promptAsync + v2.session.events SSE
 * stream to send prompts, receive token-by-token text deltas, and interrupt
 * running generations. All network I/O stays in the main process; events are
 * forwarded to the renderer via IPC push (agent:streamEvent).
 *
 * Each in-flight prompt is tracked by a composite key
 * (environmentId + chatSessionId + turnId) so the renderer can correlate
 * stream events back to the correct turn.
 */

import type {
  AgentSendPromptArgs,
  AgentSendPromptResult,
  AgentStreamEvent,
  OpenCodeEndpoint,
} from "../shared/ipc.js";
import { IPC_CHANNELS } from "../shared/ipc-channels.js";
import { msg } from "./i18n.js";
import { getEnvironments } from "./config-store.js";
import { getMainWindow } from "./main-window.js";
import { trimTrailingSlash } from "../shared/utils.js";
import { decryptValue } from "./config-store.js";
import { ensureOpenCodeReady } from "./agent-runtime-recovery.js";
import { createLogger } from "./logger.js";
import { parseSseStream } from "./sse-parser.js";

const logger = createLogger("agent-client");

const PROMPT_TIMEOUT_MS = 30_000;

const INTERRUPT_TIMEOUT_MS = 10_000;

interface InFlightPrompt {
  environmentId: string;
  chatSessionId: string;
  turnId: string;
  opencodeSessionId: string;
  abortController: AbortController;
}

const inFlight = new Map<string, InFlightPrompt>();

function inFlightKey(chatSessionId: string, turnId: string): string {
  return `${chatSessionId}:${turnId}`;
}

function forwardEvent(event: AgentStreamEvent): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.AGENT_STREAM_EVENT, event);
  }
}

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

function buildAuthHeaders(password: string | null): Record<string, string> {
  if (!password) return {};
  const encoded = Buffer.from(`admin:${password}`).toString("base64");
  return { Authorization: `Basic ${encoded}` };
}

const STREAM_TIMEOUT_MS = 10 * 60_000;

type SseConsumeResult = "completed" | "aborted";

export function mapSseEvent(
  raw: Record<string, unknown>,
  chatSessionId: string,
  turnId: string,
): AgentStreamEvent | null {
  const type = String(raw.type ?? "");

  switch (type) {
    case "text-delta":
      return { kind: "text-delta", chatSessionId, turnId, text: String(raw.text ?? "") };
    case "tool-call-start":
      return {
        kind: "tool-call-start",
        chatSessionId,
        turnId,
        toolCallId: String(raw.toolCallId ?? raw.id ?? ""),
        toolName: String(raw.toolName ?? raw.name ?? ""),
        title: String(raw.title ?? ""),
      };
    case "tool-call-output":
      return {
        kind: "tool-call-output",
        chatSessionId,
        turnId,
        toolCallId: String(raw.toolCallId ?? raw.id ?? ""),
        output: String(raw.output ?? ""),
        status: raw.status === "error" ? "error" : "completed",
      };
    case "turn-finished":
      return { kind: "turn-finished", chatSessionId, turnId };
    case "turn-error":
      return { kind: "turn-error", chatSessionId, turnId, error: String(raw.error ?? "Unknown error") };
    default:
      return null;
  }
}

export async function consumeSseStream(
  body: ReadableStream<Uint8Array>,
  chatSessionId: string,
  turnId: string,
  signal: AbortSignal,
): Promise<SseConsumeResult> {
  let streamTimeout: ReturnType<typeof setTimeout> | undefined;
  const onStreamTimeout = (): void => { signal.dispatchEvent(new Event("abort")); };
  streamTimeout = setTimeout(onStreamTimeout, STREAM_TIMEOUT_MS);
  signal.addEventListener("abort", () => { if (streamTimeout) clearTimeout(streamTimeout); }, { once: true });

  try {
    let turnFinished = false;

    await parseSseStream(body, (event) => {
      if (event.kind !== "data") return;

      let raw: Record<string, unknown>;
      try {
        raw = JSON.parse(event.text) as Record<string, unknown>;
      } catch {
        return;
      }

      const mapped = mapSseEvent(raw, chatSessionId, turnId);
      if (mapped) {
        forwardEvent(mapped);
        if (mapped.kind === "turn-finished" || mapped.kind === "turn-error") {
          turnFinished = true;
        }
      }
    });

    if (signal.aborted) {
      forwardEvent({ kind: "turn-interrupted", chatSessionId, turnId });
      return "aborted";
    }

    if (!turnFinished) {
      forwardEvent({ kind: "turn-finished", chatSessionId, turnId });
    }

    return "completed";
  } catch (err) {
    if (signal.aborted) {
      forwardEvent({ kind: "turn-interrupted", chatSessionId, turnId });
      return "aborted";
    }

    forwardEvent({ kind: "turn-error", chatSessionId, turnId, error: err instanceof Error ? err.message : String(err) });
    return "completed";
  } finally {
    if (streamTimeout) clearTimeout(streamTimeout);
  }
}

/**
 * Send a prompt to the OpenCode runtime and begin streaming events.
 * 1. Resolve the environment's OpenCode endpoint.
 * 2. POST promptAsync to create/continue a session.
 * 3. Consume the v2.session.events SSE stream, forwarding events to the renderer.
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
    await ensureOpenCodeReady(args.environmentId, baseUrl);

    const promptTimeout = setTimeout(() => controller.abort(), PROMPT_TIMEOUT_MS);
    let opencodeSessionId = args.sessionId;

    if (!opencodeSessionId) {
      const sessionRes = await fetch(`${baseUrl}/session`, {
        method: "POST",
        headers,
        body: JSON.stringify({ title: "Orbion chat" }),
        signal: controller.signal,
      });
      if (!sessionRes.ok) {
        const detail = await sessionRes.text().catch(() => "");
        clearTimeout(promptTimeout);
        return { ok: false, error: msg("agent.promptFailed", { status: String(sessionRes.status), detail: detail.slice(0, 200) }) };
      }
      const session = await sessionRes.json() as Record<string, unknown>;
      opencodeSessionId = typeof session.id === "string" ? session.id : "";
      if (!opencodeSessionId) {
        clearTimeout(promptTimeout);
        return { ok: false, error: msg("agent.promptError", { detail: "OpenCode did not return a session ID" }) };
      }
    }

    const promptRes = await fetch(`${baseUrl}/session/${encodeURIComponent(opencodeSessionId)}/message`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        parts: [{ type: "text", text: args.prompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(promptTimeout);

    if (!promptRes.ok) {
      const errText = await promptRes.text().catch(() => "");
      logger.error(`OpenCode prompt failed for ${args.environmentId}: HTTP ${promptRes.status} ${errText.slice(0, 200)}`);
      return {
        ok: false,
        error: msg("agent.promptFailed", { status: String(promptRes.status), detail: errText.slice(0, 200) }),
      };
    }

    const entry: InFlightPrompt = {
      environmentId: args.environmentId,
      chatSessionId: args.chatSessionId,
      turnId: args.turnId,
      opencodeSessionId,
      abortController: controller,
    };
    inFlight.set(key, entry);

    const eventsRes = await fetch(`${baseUrl}/v2/session/${encodeURIComponent(opencodeSessionId)}/events`, {
      headers: {
        ...buildAuthHeaders(endpointInfo.password),
        Accept: "text/event-stream",
      },
      signal: controller.signal,
    });

    if (!eventsRes.ok || !eventsRes.body) {
      const detail = await eventsRes.text().catch(() => "");
      inFlight.delete(key);
      logger.error(`OpenCode SSE stream failed for ${args.environmentId}: HTTP ${eventsRes.status}`);
      return { ok: false, error: msg("agent.promptFailed", { status: String(eventsRes.status), detail: detail.slice(0, 200) }) };
    }

    const result = await consumeSseStream(
      eventsRes.body,
      args.chatSessionId,
      args.turnId,
      controller.signal,
    );
    inFlight.delete(key);

    if (result === "aborted") {
      return { ok: false, error: msg("agent.promptTimedOut") };
    }

    return { ok: true, sessionId: opencodeSessionId };
  } catch (err) {
    inFlight.delete(key);
    if (err instanceof Error && err.name === "AbortError") {
      forwardEvent({ kind: "turn-interrupted", chatSessionId: args.chatSessionId, turnId: args.turnId });
      return { ok: false, error: msg("agent.promptTimedOut") };
    }

    const message = err instanceof Error ? err.message : String(err);
    logger.error(`OpenCode prompt request failed for ${args.environmentId}: ${message}`);
    return { ok: false, error: msg("agent.promptError", { detail: message }) };
  }
}

/** Sends an interrupt signal to the OpenCode runtime and aborts the local SSE stream consumer. Partial output is preserved. */
export async function interruptAgent(
  environmentId: string,
  sessionId?: string,
): Promise<void> {
  for (const [key, entry] of inFlight) {
    if (entry.environmentId === environmentId) {
      entry.abortController.abort();
      inFlight.delete(key);
    }
  }

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
