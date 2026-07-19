import crypto from "node:crypto";
import type { SshHost, VmWizardLaunchResult, VmWizardServiceStatus } from "../shared/ipc.js";
import { TOOL_DEFINITIONS, type ToolDefinition } from "../shared/tool-definitions.js";
import { sshExec } from "./ssh-probe.js";
import { validateSshHost } from "./ssh-config.js";
import { msg } from "./i18n.js";
import {
  VERIFIED_INSTALL_FN,
  TAILSCALE_INSTALL,
  pinnedNpmInstall,
} from "./verified-install.js";

const DEFAULT_DAEMON_PORT = 8845;
const DEFAULT_OPENCODE_PORT = 13284;
const MAX_DIAGNOSTIC_LINES_PER_SOURCE = 120;
const MAX_DIAGNOSTIC_CHARS_PER_SOURCE = 12_000;

// ─── Shell-safe helpers ──────────────────────────────────────────────

/**
 * Assert that a port number is a valid TCP port (1–65535).
 * Throws if the value is out of range or not a safe integer.
 */
function assertSafePort(port: number, name: string): void {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid ${name}: ${port}`);
  }
}

/**
 * Validate that a hash value contains only hex characters (1–12 chars).
 * The output of hashForHost() is always a 12-char hex substring;
 * any value that does not match this pattern is rejected to prevent
 * shell injection via template substitution.
 */
function validateHash(hash: string): void {
  if (!/^[a-f0-9]{1,12}$/.test(hash)) {
    throw new Error(`Invalid hash: "${hash}" contains disallowed characters`);
  }
}

function hashForHost(host: SshHost): string {
  validateSshHost(host);
  return crypto.createHash("sha256").update(`${host.user}@${host.hostName}:${host.port}`).digest("hex").slice(0, 12);
}

// ─── Dynamic shell script generation ────────────────────────────────

/**
 * Generate the install block for a single tool based on its definition and strategy.
 *
 * Each block follows the pattern:
 *   1. Check __INSTALL_<ID>__ placeholder
 *   2. Check if tool is already installed via `command -v`
 *   3. Echo "<ID>_INSTALLING"
 *   4. Install via the appropriate package manager
 *   5. Echo "<ID>_INSTALLED" or "INSTALL_FAILED_<ID>"
 */
function generateInstallBlock(tool: ToolDefinition): string {
  const id = tool.id;
  const marker = id.toUpperCase(); // e.g. "GH", "AZDO", "DOCKER"
  const binary = tool.binary;
  const logFile = `$LAUNCH_DIR/install-${tool.logSuffix}.log`;

  const header = `# ── Optional: ${id} ──────────────────────────────────────────
INSTALL_${marker}="__INSTALL_${marker}__"
if [ -n "$INSTALL_${marker}" ]; then
  if ! command -v "${binary}" >/dev/null 2>&1; then
    echo "${marker}_INSTALLING"`;

  const failureHandler = `echo "INSTALL_FAILED_${marker}"; exit 1;`;
  const installFailedNoPkg = `echo "INSTALL_FAILED_${marker}|no supported package manager found"; exit 1`;
  const success = `    echo "${marker}_INSTALLED"
  fi
fi`;

  let installLogic: string;

  switch (tool.strategy) {
    case "npm": {
      if (!tool.npmKey) throw new Error(`Tool ${id} uses npm strategy but has no npmKey`);
      installLogic = `    "$NODE_BIN" -e "const { execSync } = require('child_process'); execSync('__NPM_${marker}__', { stdio: 'inherit' });" 2>"${logFile}" || { ${failureHandler} }`;
      break;
    }
    case "apt": {
      installLogic = `    if command -v apt-get >/dev/null 2>&1; then
      apt-get update -qq && apt-get install -y -qq "${binary}" 2>"${logFile}" || { ${failureHandler} }
    else
      ${installFailedNoPkg}
    fi`;
      break;
    }
    case "apt-brew": {
      if (id === "terraform") {
        installLogic = `    if command -v apt-get >/dev/null 2>&1; then
      wget -qO- https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg 2>/dev/null
      echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/hashicorp.list > /dev/null
      apt-get update -qq && apt-get install -y -qq "${binary}" 2>"${logFile}" || { ${failureHandler} }
    elif command -v brew >/dev/null 2>&1; then
      brew install "${binary}" 2>"${logFile}" || { ${failureHandler} }
    else
      ${installFailedNoPkg}
    fi`;
      } else {
        // Generic apt-brew fallback
        installLogic = `    if command -v apt-get >/dev/null 2>&1; then
      apt-get update -qq && apt-get install -y -qq "${binary}" 2>"${logFile}" || { ${failureHandler} }
    elif command -v brew >/dev/null 2>&1; then
      brew install "${binary}" 2>"${logFile}" || { ${failureHandler} }
    else
      ${installFailedNoPkg}
    fi`;
      }
      break;
    }
    case "apt-snap": {
      installLogic = `    if command -v apt-get >/dev/null 2>&1; then
      apt-get update -qq && apt-get install -y -qq "${binary}" 2>"${logFile}" || { ${failureHandler} }
    elif command -v snap >/dev/null 2>&1; then
      snap install "${binary}" 2>"${logFile}" || { ${failureHandler} }
    else
      ${installFailedNoPkg}
    fi`;
      break;
    }
    case "pip-apt": {
      if (id === "azDo") {
        installLogic = `    if command -v pip3 >/dev/null 2>&1; then
      pip3 install azure-cli 2>"${logFile}" || { ${failureHandler} }
    elif command -v apt-get >/dev/null 2>&1; then
      apt-get update -qq && apt-get install -y -qq azure-cli 2>"${logFile}" || { ${failureHandler} }
    else
      ${installFailedNoPkg}
    fi
    az extension add --name azure-devops 2>/dev/null || true`;
      } else {
        installLogic = `    if command -v pip3 >/dev/null 2>&1; then
      pip3 install "${binary}" 2>"${logFile}" || { ${failureHandler} }
    elif command -v apt-get >/dev/null 2>&1; then
      apt-get update -qq && apt-get install -y -qq "${binary}" 2>"${logFile}" || { ${failureHandler} }
    else
      ${installFailedNoPkg}
    fi`;
      }
      break;
    }
    case "apt-keys": {
      if (id === "gh") {
        installLogic = `    if command -v apt-get >/dev/null 2>&1; then
      type -p wget >/dev/null || (apt-get update -qq && apt-get install -y -qq wget)
      wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null
      chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
      apt-get update -qq && apt-get install -y -qq gh 2>"${logFile}" || { ${failureHandler} }
    elif command -v brew >/dev/null 2>&1; then
      brew install gh 2>"${logFile}" || { ${failureHandler} }
    else
      ${installFailedNoPkg}
    fi`;
      } else {
        // Generic apt-keys (shouldn't happen but for safety)
        installLogic = `    if command -v apt-get >/dev/null 2>&1; then
      apt-get update -qq && apt-get install -y -qq "${binary}" 2>"${logFile}" || { ${failureHandler} }
    else
      ${installFailedNoPkg}
    fi`;
      }
      break;
    }
    case "verified": {
      if (id === "tailscale") {
        installLogic = `    verified_install "__TAILSCALE_URL__" "__TAILSCALE_SHA__" "${logFile}" || { ${failureHandler} }`;
      } else {
        installLogic = `    verified_install "__${marker}_URL__" "__${marker}_SHA__" "${logFile}" || { ${failureHandler} }`;
      }
      break;
    }
    default: {
      const _exhaustive: never = tool.strategy;
      throw new Error(`Unknown install strategy: ${_exhaustive}`);
    }
  }

  return `${header}
${installLogic}
${success}`;
}

/**
 * Build the full launch script template dynamically from TOOL_DEFINITIONS.
 * Only the mandatory loop-task install and daemon/opencode startup remain
 * inline — all optional tool installs are generated from data.
 */
function buildLaunchScriptTemplate(): string {
  const optionalBlocks = TOOL_DEFINITIONS
    .map((t) => generateInstallBlock(t))
    .join("\n\n");

  // OpenCode has special post-install startup logic (separate port check)
  // so we still need INSTALL_OPENCODE / OPENCODE_PORT placeholders. They are
  // generated by the tool definition but referenced again in the startup.

  return `
set -e

# ── Integrity-verified install function ──────────────────────────────
# Replaces unsafe \`curl ... | sh\` with download-verify-then-execute.
# See: https://github.com/orbion/orbion/issues/51
__VERIFIED_INSTALL_FN__

LAUNCH_DIR="$HOME/.orbion/ssh-launch/__HASH__"
mkdir -p "$LAUNCH_DIR"

# Write a marker file so we know Orbion started this
echo "orbion-managed" > "$LAUNCH_DIR/.managed"

# Determine the node binary to use
NODE_BIN=""
if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
fi

# Check version manager paths if system node is missing
if [ -z "$NODE_BIN" ] || [ "$NODE_BIN" = "" ]; then
  for manager_dir in \\
    "$HOME/.nvm/versions/node" \\
    "$HOME/.local/share/fnm/node-versions" \\
    "$HOME/.asdf/installs/nodejs" \\
    "$HOME/.local/share/mise/installs/node" \\
    "$HOME/.volta/tools/node"; do
    if [ -d "$manager_dir" ]; then
      latest="$(find "$manager_dir" -maxdepth 4 -name 'node' -path '*/bin/node' 2>/dev/null | sort -V | tail -1)"
      if [ -n "$latest" ]; then
        NODE_BIN="$latest"
        break
      fi
    fi
  done
fi

if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  echo "INSTALL_NODE_FIRST"
  exit 1
fi

echo "NODE_FOUND|\${NODE_BIN}|$($NODE_BIN --version)"

# Check if loop-task daemon is already running on the expected port
DAEMON_PORT=__DAEMON_PORT__
if ss -tlnp 2>/dev/null | grep -q ":\${DAEMON_PORT} "; then
  EXISTING_PID="$(ss -tlnp 2>/dev/null | grep ":\${DAEMON_PORT} " | grep -oP 'pid=\\K[0-9]+' | head -1 || true)"
  if [ -n "$EXISTING_PID" ] && [ -f "$LAUNCH_DIR/.managed" ]; then
    echo "DAEMON_ALREADY_RUNNING|\${DAEMON_PORT}|\${EXISTING_PID}"
  else
    echo "DAEMON_PORT_BUSY|\${DAEMON_PORT}"
  fi
  DAEMON_SKIP=1
fi

# ── Mandatory: loop-task ──────────────────────────────────────────
# Always installed, loop-task is mandatory (no __INSTALL__ flag needed).
if [ -z "$DAEMON_SKIP" ]; then
  if ! command -v loop-task >/dev/null 2>&1; then
    echo "LOOP_TASK_INSTALLING"
    "$NODE_BIN" -e "const { execSync } = require('child_process'); execSync('__NPM_LOOP_TASK__', { stdio: 'inherit' });" 2>"$LAUNCH_DIR/install.log" || {
      echo "INSTALL_FAILED_LOOP_TASK"
      cat "$LAUNCH_DIR/install.log" 2>/dev/null
      exit 1
    }
    echo "LOOP_TASK_INSTALLED"
  fi
fi

# ── Optional tool installs (generated from TOOL_DEFINITIONS) ───────
${optionalBlocks}

# ── Start loop-task daemon (bound to loopback) ───────────────────
if [ -z "$DAEMON_SKIP" ]; then
  echo "DAEMON_STARTING|\${DAEMON_PORT}"
  nohup loop-task serve --host 127.0.0.1 --port "\${DAEMON_PORT}" > "$LAUNCH_DIR/daemon.log" 2>&1 &
  DAEMON_PID=$!
  echo "$DAEMON_PID" > "$LAUNCH_DIR/daemon.pid"

  daemon_ready() {
    if command -v curl >/dev/null 2>&1; then
      curl -sS -o /dev/null --connect-timeout 1 --max-time 1 "http://127.0.0.1:\${DAEMON_PORT}/api/projects" 2>/dev/null
      return $?
    fi

    if command -v ss >/dev/null 2>&1; then
      ss -tln 2>/dev/null | grep -Eq "127\\.0\\.0\\.1:\${DAEMON_PORT}[[:space:]]"
    elif command -v lsof >/dev/null 2>&1; then
      lsof -nP -iTCP:"\${DAEMON_PORT}" -sTCP:LISTEN 2>/dev/null | grep -q "127.0.0.1:\${DAEMON_PORT}"
    elif command -v netstat >/dev/null 2>&1; then
      netstat -an 2>/dev/null | grep -Eq "127\\.0\\.0\\.1[.:]\${DAEMON_PORT}[[:space:]].*LISTEN"
    elif command -v nc >/dev/null 2>&1; then
      nc -z 127.0.0.1 "\${DAEMON_PORT}" >/dev/null 2>&1
    else
      return 1
    fi
  }

  DAEMON_READY=""
  STARTUP_ATTEMPT=0
  while [ "$STARTUP_ATTEMPT" -lt 20 ]; do
    if ! kill -0 "$DAEMON_PID" 2>/dev/null; then
      break
    fi
    if daemon_ready && kill -0 "$DAEMON_PID" 2>/dev/null; then
      DAEMON_READY=1
      break
    fi
    STARTUP_ATTEMPT=$((STARTUP_ATTEMPT + 1))
    sleep 1
  done

  if [ -z "$DAEMON_READY" ]; then
    echo "DAEMON_START_FAILED"
    cat "$LAUNCH_DIR/daemon.log" 2>/dev/null || true
    kill "$DAEMON_PID" 2>/dev/null || true
    rm -f "$LAUNCH_DIR/daemon.pid" "$LAUNCH_DIR/daemon.info"
    exit 1
  fi

  echo "port=\${DAEMON_PORT}" > "$LAUNCH_DIR/daemon.info"
  echo "DAEMON_STARTED|\${DAEMON_PORT}|\${DAEMON_PID}"
fi

# Start opencode server (bound to loopback)
OPENCODE_PORT=__OPENCODE_PORT__
if [ -n "$INSTALL_OPENCODE" ]; then
  if ss -tlnp 2>/dev/null | grep -q ":\${OPENCODE_PORT} "; then
    echo "OPENCODE_PORT_BUSY|\${OPENCODE_PORT}"
  else
    echo "OPENCODE_STARTING|\${OPENCODE_PORT}"
    nohup opencode serve --host 127.0.0.1 --port "\${OPENCODE_PORT}" > "$LAUNCH_DIR/opencode.log" 2>&1 &
    OPENCODE_PID=$!
    echo "$OPENCODE_PID" > "$LAUNCH_DIR/opencode.pid"
    echo "port=\${OPENCODE_PORT}" > "$LAUNCH_DIR/opencode.info"
    echo "OPENCODE_STARTED|\${OPENCODE_PORT}|\${OPENCODE_PID}"
  fi
fi

echo "LAUNCH_DONE"
`;
}

const LAUNCH_SCRIPT_TEMPLATE = buildLaunchScriptTemplate();

const TAIL_LOG_SCRIPT = `
LAUNCH_DIR="$HOME/.orbion/ssh-launch/__HASH__"
if [ -f "$LAUNCH_DIR/daemon.log" ]; then
  tail -20 "$LAUNCH_DIR/daemon.log" 2>/dev/null || true
fi
`;

const TAIL_LAUNCH_FAILURE_LOGS_SCRIPT = `
LAUNCH_DIR="$HOME/.orbion/ssh-launch/__HASH__"
for log_file in \
  "$LAUNCH_DIR/install.log" \
  "$LAUNCH_DIR"/install-*.log \
  "$LAUNCH_DIR/daemon.log" \
  "$LAUNCH_DIR/opencode.log"; do
  if [ -s "$log_file" ]; then
    printf '\n[%s]\n' "\${log_file##*/}"
    tail -120 "$log_file" 2>/dev/null || true
  fi
done
`;

function trimDiagnosticOutput(output: string): string {
  const normalized = output.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";

  const recentLines = normalized.split("\n").slice(-MAX_DIAGNOSTIC_LINES_PER_SOURCE).join("\n");
  return recentLines.slice(-MAX_DIAGNOSTIC_CHARS_PER_SOURCE).trim();
}

function buildLaunchFailureLogTail(
  launchStdout: string,
  launchStderr: string,
  remoteLogsStdout: string,
  remoteLogsStderr: string,
): string | null {
  const sources = [
    ["stdout", launchStdout],
    ["stderr", launchStderr],
    ["remote logs", remoteLogsStdout],
    ["remote log stderr", remoteLogsStderr],
  ] as const;
  const seenLines = new Set<string>();
  const sections: string[] = [];

  for (const [label, rawOutput] of sources) {
    const output = trimDiagnosticOutput(rawOutput);
    if (!output) continue;

    const lines = output.split("\n");
    const uniqueLines = lines.filter((line) => {
      const key = line.trim();
      return !key || !seenLines.has(key);
    });
    const uniqueOutput = uniqueLines.join("\n").trim();
    if (!uniqueOutput) continue;

    sections.push(`[${label}]\n${uniqueOutput}`);
    for (const line of lines) {
      const key = line.trim();
      if (key) seenLines.add(key);
    }
  }

  return sections.length > 0 ? sections.join("\n\n") : null;
}

// ─── Marker parsing ─────────────────────────────────────────────

/** Pre-computed marker maps for fast stdout line parsing */
const INSTALLED_MARKER_TO_ID = new Map<string, string>();
const FAILED_MARKER_PREFIX_TO_ID = new Map<string, string>();

for (const tool of TOOL_DEFINITIONS) {
  const marker = tool.id.toUpperCase();
  INSTALLED_MARKER_TO_ID.set(`${marker}_INSTALLED`, tool.id);
  FAILED_MARKER_PREFIX_TO_ID.set(`INSTALL_FAILED_${marker}`, tool.id);
}

/** Map of npmKey -> tool id for placeholder replacement */
const NPM_KEY_TO_MARKER = new Map<string, string>();
for (const tool of TOOL_DEFINITIONS) {
  if (tool.npmKey) {
    NPM_KEY_TO_MARKER.set(tool.npmKey, tool.id.toUpperCase());
  }
}

export async function launchOnVm(
  host: SshHost,
  probeResult: {
    daemonRunning: boolean;
    daemonPort: number | null;
    opencodeRunning: boolean;
    opencodePort: number | null;
    installTools: Record<string, boolean>;
  },
): Promise<VmWizardLaunchResult> {
  // Initialize all tool statuses to "pending"
  const toolStatuses: Record<string, VmWizardServiceStatus> = {};
  for (const tool of TOOL_DEFINITIONS) {
    toolStatuses[tool.id] = "pending";
  }

  const result: VmWizardLaunchResult = {
    started: false,
    daemonPort: null,
    opencodePort: null,
    errorDetail: null,
    logTail: null,
    loopTaskStatus: "pending",
    toolStatuses,
  };

  // Validate host fields before using them in any command construction
  try {
    validateSshHost(host);
  } catch {
    result.errorDetail = msg("vmWizard.mainInvalidTarget", { target: host.label });
    return result;
  }

  const hash = hashForHost(host);
  const daemonPort = probeResult.daemonPort ?? DEFAULT_DAEMON_PORT;
  const opencodePort = probeResult.opencodePort ?? DEFAULT_OPENCODE_PORT;

  // Validate hash and port numbers before substituting into shell scripts.
  validateHash(hash);
  assertSafePort(daemonPort, "daemonPort");
  assertSafePort(opencodePort, "opencodePort");

  if (probeResult.daemonRunning && probeResult.daemonPort) {
    result.started = true;
    result.daemonPort = probeResult.daemonPort;
    result.loopTaskStatus = "already-running";
    result.opencodePort = probeResult.opencodeRunning ? (probeResult.opencodePort ?? DEFAULT_OPENCODE_PORT) : opencodePort;
    result.toolStatuses.openCode = probeResult.opencodeRunning ? "already-running" : "pending";
  }

  // Mark tools as "skipped" when not selected for install
  for (const tool of TOOL_DEFINITIONS) {
    if (!probeResult.installTools[tool.id]) {
      result.toolStatuses[tool.id] = "skipped";
    }
  }

  // Build placeholder replacements dynamically
  let script = LAUNCH_SCRIPT_TEMPLATE
    .replace(/__HASH__/g, hash)
    .replace(/__VERIFIED_INSTALL_FN__/g, VERIFIED_INSTALL_FN)
    .replace(/__TAILSCALE_URL__/g, TAILSCALE_INSTALL.url)
    .replace(/__TAILSCALE_SHA__/g, TAILSCALE_INSTALL.sha256)
    .replace(/__NPM_LOOP_TASK__/g, pinnedNpmInstall("loopTask"));

  // Replace npm install placeholders for npm-strategy tools
  for (const [npmKey, marker] of NPM_KEY_TO_MARKER) {
    script = script.replace(
      new RegExp(`__NPM_${marker}__`, "g"),
      pinnedNpmInstall(npmKey as keyof typeof import("./verified-install.js").NPM_PACKAGES),
    );
  }

  // Replace port placeholders
  script = script
    .replace(/__DAEMON_PORT__/g, String(daemonPort))
    .replace(/__OPENCODE_PORT__/g, String(opencodePort));

  // Replace install flag placeholders for all tools
  for (const tool of TOOL_DEFINITIONS) {
    const marker = tool.id.toUpperCase();
    script = script.replace(
      new RegExp(`__INSTALL_${marker}__`, "g"),
      probeResult.installTools[tool.id] ? "1" : "",
    );
  }

  const launchResult = await sshExec(host, script);

  if (launchResult.code !== 0) {
    const tailScript = TAIL_LAUNCH_FAILURE_LOGS_SCRIPT.replace(/__HASH__/g, hash);
    const tailResult = await sshExec(host, tailScript);
    result.logTail = buildLaunchFailureLogTail(
      launchResult.stdout,
      launchResult.stderr,
      tailResult.stdout,
      tailResult.stderr,
    );
    result.errorDetail = msg("vmWizard.mainLaunchScriptFailed", { code: launchResult.code });

    for (const line of launchResult.stdout.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "INSTALL_NODE_FIRST") {
        result.errorDetail = msg("vmWizard.mainNodeNotFoundOnVm");
      } else if (trimmed === "INSTALL_FAILED_LOOP_TASK") {
        result.errorDetail = msg("vmWizard.mainInstallLoopTaskFailed");
        result.loopTaskStatus = "failed";
      } else if (trimmed === "DAEMON_START_FAILED") {
        result.errorDetail = msg("vmWizard.mainFailedToStartServices");
        result.loopTaskStatus = "failed";
      } else if (trimmed.startsWith("DAEMON_PORT_BUSY|")) {
        result.errorDetail = msg("vmWizard.mainDaemonPortBusy", { port: daemonPort });
      } else if (trimmed.startsWith("OPENCODE_PORT_BUSY|")) {
        result.errorDetail = msg("vmWizard.mainOpenCodePortBusy", { port: opencodePort });
      } else {
        // Check dynamic tool failure markers
        for (const [prefix, toolId] of FAILED_MARKER_PREFIX_TO_ID) {
          if (trimmed.startsWith(prefix)) {
            result.toolStatuses[toolId] = "failed";
            break;
          }
        }
      }
    }

    return result;
  }

  for (const line of launchResult.stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("DAEMON_ALREADY_RUNNING|")) {
      result.daemonPort = parseInt(trimmed.split("|")[1] ?? String(daemonPort), 10);
      result.loopTaskStatus = "already-running";
    } else if (trimmed.startsWith("DAEMON_STARTED|")) {
      result.daemonPort = parseInt(trimmed.split("|")[1] ?? String(daemonPort), 10);
      result.loopTaskStatus = "started";
    } else if (trimmed === "LOOP_TASK_INSTALLED") {
      result.loopTaskStatus = "installed";
    } else if (trimmed.startsWith("OPENCODE_STARTED|")) {
      result.opencodePort = parseInt(trimmed.split("|")[1] ?? String(opencodePort), 10);
      result.toolStatuses.openCode = "started";
    } else if (trimmed === "OPENCODE_INSTALLED") {
      result.toolStatuses.openCode = "installed";
    } else if (trimmed.startsWith("OPENCODE_PORT_BUSY|")) {
      result.opencodePort = null;
      result.toolStatuses.openCode = "already-running";
    } else {
      // Check dynamic installed markers
      const toolId = INSTALLED_MARKER_TO_ID.get(trimmed);
      if (toolId) {
        result.toolStatuses[toolId] = "installed";
      }
    }
  }

  result.started = true;
  return result;
}

export async function createPairingCodeOnRemote(host: SshHost, daemonPort: number): Promise<string | null> {
  // Validate inputs before constructing any shell command
  try {
    validateSshHost(host);
  } catch {
    return null;
  }
  assertSafePort(daemonPort, "daemonPort");

  // Use shell-escaped port interpolation to prevent injection.
  // daemonPort is validated as a safe integer 1–65535 above, so
  // String(daemonPort) can only contain digits.
  const script = `curl -s http://127.0.0.1:${String(daemonPort)}/api/pair/create 2>/dev/null || echo "PAIR_CREATE_FAILED"`;
  const sshResult = await sshExec(host, script);

  if (sshResult.code !== 0) return null;

  try {
    const parsed = JSON.parse(sshResult.stdout) as { ok?: boolean; code?: string; error?: { message?: string } };
    if (parsed.ok && parsed.code) return parsed.code;
    return null;
  } catch {
    return null;
  }
}

export async function readRemoteLog(host: SshHost, hash: string): Promise<string | null> {
  try {
    validateSshHost(host);
  } catch {
    return null;
  }
  // Validate hash before substituting into shell template to prevent
  // command injection. hashForHost() always produces hex, but this
  // function accepts arbitrary strings from callers.
  try {
    validateHash(hash);
  } catch {
    return null;
  }
  const script = TAIL_LOG_SCRIPT.replace(/__HASH__/g, hash);
  const sshResult = await sshExec(host, script);
  return sshResult.stdout.trim() || null;
}

export { hashForHost, validateHash };
