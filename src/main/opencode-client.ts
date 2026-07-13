import { createOpencodeClient, OpencodeClient } from "@opencode-ai/sdk";
import type {
  OpenCodeConnectionStatus,
  OpenCodeEndpoint,
} from "../shared/ipc.js";
import { BrowserWindow } from "electron";

const OPENCODE_MIN_VERSION = "1.0.0";

const STATUS_CACHE_MS = 30_000;
const PROBE_TIMEOUT_MS = 10_000;

const statusCache = new Map<string, { status: OpenCodeConnectionStatus; at: number }>();

function emptyStatus(): OpenCodeConnectionStatus {
  return {
    authState: "unknown",
    errorKind: null,
    errorMessage: null,
    serverVersion: null,
    connectedProviders: [],
    checkedAt: null,
  };
}

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

function makeClient(endpoint: OpenCodeEndpoint): OpencodeClient {
  const baseUrl = endpoint.url.trim().replace(/\/+$/, "");
  const headers: Record<string, string> = {};

  if (endpoint.password) {
    const encoded = Buffer.from(`admin:${endpoint.password}`).toString("base64");
    headers["Authorization"] = `Basic ${encoded}`;
  }

  return createOpencodeClient({ baseUrl, headers });
}

async function probeWithClient(
  client: OpencodeClient,
): Promise<OpenCodeConnectionStatus> {
  const status = emptyStatus();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const providerResult = await client.provider.list({
      fetch: (req) => {
        const signal = controller.signal;
        return fetch(req, { signal });
      },
    });

    clearTimeout(timeout);

    if (providerResult.error) {
      const err = providerResult.error;
      const errAny = err as Record<string, unknown>;

      if (providerResult.response) {
        const httpStatus = providerResult.response.status;
        if (httpStatus === 401 || httpStatus === 403) {
          status.authState = "unknown";
          status.errorKind = "rejected";
          status.errorMessage =
            httpStatus === 401
              ? "Wrong password for OpenCode server"
              : "Access denied by OpenCode server";
          status.checkedAt = Date.now();
          return status;
        }
      }

      if (errAny && typeof errAny === "object" && "name" in errAny) {
        const name = errAny.name as string;
        if (name === "ProviderAuthError") {
          status.authState = "unauthenticated";
          status.errorKind = "unauthenticated";
          status.errorMessage = "Run `opencode auth login` on the VM to connect a provider";
          status.checkedAt = Date.now();
          return status;
        }
      }

      status.authState = "unknown";
      status.errorKind = "unreachable";
      status.errorMessage = errAny?.message
        ? String(errAny.message)
        : "Could not reach OpenCode server";
      status.checkedAt = Date.now();
      return status;
    }

    const data = providerResult.data;
    const connected = data?.connected ?? [];

    status.connectedProviders = connected;
    status.authState = connected.length > 0 ? "authenticated" : "unauthenticated";

    if (status.authState === "unauthenticated") {
      status.errorKind = "unauthenticated";
      status.errorMessage = "Run `opencode auth login` on the VM to connect a provider";
    }

    const configResult = await client.config.get();
    if (configResult.data) {
      const configAny = configResult.data as Record<string, unknown>;
      if (typeof configAny["$version"] === "string") {
        status.serverVersion = configAny["$version"];
      }
    }

    if (status.serverVersion && compareSemver(status.serverVersion, OPENCODE_MIN_VERSION) < 0) {
      status.errorKind = "version";
      status.errorMessage = `OpenCode server version ${status.serverVersion} is below minimum ${OPENCODE_MIN_VERSION}. Update OpenCode on the VM.`;
    }

    status.checkedAt = Date.now();
    return status;
  } catch (err) {
    clearTimeout(timeout);

    const message =
      err instanceof Error && err.name === "AbortError"
        ? "OpenCode server request timed out"
        : err instanceof Error
          ? err.message
          : String(err);

    const lower = message.toLowerCase();
    if (
      lower.includes("econnrefused") ||
      lower.includes("enotfound") ||
      lower.includes("enetunreach") ||
      lower.includes("request timed out")
    ) {
      status.errorKind = "unreachable";
      status.errorMessage = `Cannot reach OpenCode server: ${message}`;
    } else if (lower.includes("401") || lower.includes("unauthorized")) {
      status.errorKind = "rejected";
      status.errorMessage = "Wrong password for OpenCode server";
    } else {
      status.errorKind = "unreachable";
      status.errorMessage = message;
    }

    status.authState = "unknown";
    status.checkedAt = Date.now();
    return status;
  }
}

export function getOpenCodeStatus(environmentId: string): OpenCodeConnectionStatus {
  const cached = statusCache.get(environmentId);
  if (cached && Date.now() - cached.at < STATUS_CACHE_MS) {
    return cached.status;
  }
  return emptyStatus();
}

export async function refreshOpenCodeStatus(
  environmentId: string,
  endpoint: OpenCodeEndpoint,
): Promise<OpenCodeConnectionStatus> {
  const client = makeClient(endpoint);
  const status = await probeWithClient(client);
  statusCache.set(environmentId, { status, at: Date.now() });

  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send("opencode:status", { environmentId, status });
  }

  return status;
}

export function clearOpenCodeStatus(environmentId: string): void {
  statusCache.delete(environmentId);
}
