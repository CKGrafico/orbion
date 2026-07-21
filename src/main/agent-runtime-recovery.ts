import { execFile } from "node:child_process";
import { getEnvironments } from "./config-store.js";
import { createLogger } from "./logger.js";
import { buildSshArgs, parseTarget } from "./ssh-config.js";

const logger = createLogger("agent-runtime-recovery");
const HEALTH_TIMEOUT_MS = 5_000;
const STARTUP_ATTEMPTS = 12;
const STARTUP_WAIT_MS = 1_000;
const recoveryAttempts = new Map<string, Promise<void>>();

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isServerReachable(baseUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    await fetch(`${baseUrl}/global/health`, { signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function openCodePort(endpointUrl: string): number | null {
  try {
    const url = new URL(endpointUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  } catch {
    return null;
  }
}

async function startViaSsh(environmentId: string, port: number): Promise<boolean> {
  const environment = getEnvironments().find((candidate) => candidate.id === environmentId);
  const host = environment?.sshControlTarget ? parseTarget(environment.sshControlTarget) : null;

  if (!host) {
    logger.warn(`OpenCode unavailable for ${environmentId}; no SSH endpoint is configured for recovery`);
    return false;
  }

  const command = [
    `if pgrep -f 'opencode.*serve.*--port ${port}' >/dev/null 2>&1; then exit 0; fi`,
    "mkdir -p ~/.orbion",
    `nohup opencode serve --host 0.0.0.0 --port ${port} > ~/.orbion/opencode.log 2>&1 &`,
  ].join("; ");

  logger.info(`Starting OpenCode on ${environmentId} through SSH, port ${port}`);

  return new Promise((resolve) => {
    execFile("ssh", buildSshArgs(host, command), { timeout: 15_000 }, (error, _stdout, stderr) => {
      if (error) {
        logger.error(`OpenCode recovery command failed for ${environmentId}: ${error.message}; ${stderr.trim()}`);
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}

async function recoverOpenCode(environmentId: string, baseUrl: string): Promise<void> {
  if (await isServerReachable(baseUrl)) return;

  const port = openCodePort(baseUrl);
  if (!port || !(await startViaSsh(environmentId, port))) return;

  for (let attempt = 1; attempt <= STARTUP_ATTEMPTS; attempt += 1) {
    await wait(STARTUP_WAIT_MS);
    if (await isServerReachable(baseUrl)) {
      logger.info(`OpenCode ready for ${environmentId} after ${attempt}s`);
      return;
    }
  }

  logger.error(`OpenCode did not become reachable for ${environmentId} after ${STARTUP_ATTEMPTS}s`);
}

export async function ensureOpenCodeReady(environmentId: string, baseUrl: string): Promise<void> {
  const activeAttempt = recoveryAttempts.get(environmentId);
  if (activeAttempt) {
    await activeAttempt;
    return;
  }

  const attempt = recoverOpenCode(environmentId, baseUrl);
  recoveryAttempts.set(environmentId, attempt);
  try {
    await attempt;
  } finally {
    recoveryAttempts.delete(environmentId);
  }
}
