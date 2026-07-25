import type { ModelInfo, ListModelsResult, OpenCodeEndpoint } from "../shared/ipc.js";
import { getEnvironments } from "./config-store.js";
import { decryptValue } from "./config-store.js";
import { trimTrailingSlash } from "../shared/utils.js";
import { ensureOpenCodeReady } from "./agent-runtime-recovery.js";

const OPENAI_MODELS: ModelInfo[] = [
  { id: "openai/gpt-4o", label: "GPT-4o", provider: "openai", available: true, reasoningEfforts: ["low", "medium", "high"] },
  { id: "openai/gpt-4o-mini", label: "GPT-4o Mini", provider: "openai", available: true, reasoningEfforts: [] },
  { id: "openai/o1", label: "o1", provider: "openai", available: true, reasoningEfforts: ["low", "medium", "high"] },
  { id: "openai/o3-mini", label: "o3-mini", provider: "openai", available: true, reasoningEfforts: ["low", "medium", "high"] },
];

const ANTHROPIC_MODELS: ModelInfo[] = [
  { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet", provider: "anthropic", available: true, reasoningEfforts: ["low", "medium", "high"] },
  { id: "anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku", provider: "anthropic", available: true, reasoningEfforts: ["low", "medium"] },
  { id: "anthropic/claude-3-opus", label: "Claude 3 Opus", provider: "anthropic", available: true, reasoningEfforts: ["low", "medium", "high"] },
];

function resolveOpenCodeEndpoint(environmentId: string): { url: string; password: string | null } | null {
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

  return { url: endpoint.url, password };
}

function buildAuthHeaders(password: string | null): Record<string, string> {
  if (!password) return {};
  const encoded = Buffer.from(`admin:${password}`).toString("base64");
  return { Authorization: `Basic ${encoded}` };
}

export async function listModelsForEnvironment(
  environmentId: string,
): Promise<ListModelsResult> {
  const endpointInfo = resolveOpenCodeEndpoint(environmentId);
  if (!endpointInfo) {
    return { ok: true, models: [] };
  }

  const baseUrl = trimTrailingSlash(endpointInfo.url.trim());
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...buildAuthHeaders(endpointInfo.password),
  };

  await ensureOpenCodeReady(environmentId, baseUrl);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    const res = await fetch(`${baseUrl}/models`, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json() as { models?: ModelInfo[] };
      if (Array.isArray(data.models) && data.models.length > 0) {
        return { ok: true, models: data.models };
      }
    }
  } catch {
    // Fall through to static catalog
  }

  // Fallback: OpenCode runtime → OpenAI + Anthropic; Claude runtime → Anthropic only
  const envs = getEnvironments();
  const env = envs.find((e) => e.id === environmentId);
  const isClaude = env?.agentRuntime === "claude";

  if (isClaude) {
    return { ok: true, models: ANTHROPIC_MODELS };
  }

  return { ok: true, models: [...OPENAI_MODELS, ...ANTHROPIC_MODELS] };
}
