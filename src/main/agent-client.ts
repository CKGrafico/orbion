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
import { msg } from "./i18n.js";
import { getEnvironments } from "./config-store.js";
import { getMainWindow } from "./main-window.js";
import { trimTrailingSlash } from "../shared/utils.js";
import { decryptValue } from "./config-store.js";
import { ensureOpenCodeReady } from "./agent-runtime-recovery.js";
import { createLogger } from "./logger.js";

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
    win.webContents.send("agent:streamEvent", event);
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

function responseText(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((part): part is Record<string, unknown> => typeof part === "object" && part !== null)
    .filter((part) => part.type === "text")
    .map((part) => String(part.text ?? part.content ?? ""))
    .join("");
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

    const promptData = await promptRes.json() as Record<string, unknown>;

    const entry: InFlightPrompt = {
      environmentId: args.environmentId,
      chatSessionId: args.chatSessionId,
      turnId: args.turnId,
      opencodeSessionId,
      abortController: controller,
    };
    inFlight.set(key, entry);

    const text = responseText(promptData.parts);
    if (text) forwardEvent({ kind: "text-delta", chatSessionId: args.chatSessionId, turnId: args.turnId, text });
    forwardEvent({ kind: "turn-finished", chatSessionId: args.chatSessionId, turnId: args.turnId });
    inFlight.delete(key);

    return { ok: true, sessionId: opencodeSessionId };
  } catch (err) {
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
