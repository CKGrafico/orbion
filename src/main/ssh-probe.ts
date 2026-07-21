import { execFile } from "node:child_process";
import type { SshHost, VmWizardProbeResult, I18nMessage } from "../shared/ipc.js";
import { TOOL_DEFINITIONS } from "../shared/tool-definitions.js";
import { compareSemver } from "../shared/utils.js";
import { buildSshArgs } from "./ssh-config.js";
import { msg } from "./i18n.js";
import { NODE_RESOLVE_SCRIPT } from "./ssh-scripts.js";
import {
  VERIFIED_INSTALL_FN,
  MISE_INSTALL,
} from "./verified-install.js";

const NODE_VERSION_FLOOR = "20.0.0";

function sshExec(host: SshHost, command: string, timeout = 30_000): Promise<{ stdout: string; stderr: string; code: number }> {
  const args = buildSshArgs(host, command);
  return new Promise((resolve) => {
    execFile("ssh", args, { timeout }, (err, stdout, stderr) => {
      resolve({
        stdout: stdout ?? "",
        stderr: stderr ?? "",
        code: err && "code" in err ? (err.code as number) : err ? 1 : 0,
      });
    });
  });
}

const NODE_PROBE_SCRIPT = `
set -e
${NODE_RESOLVE_SCRIPT}

if [ -z "\${node_path}" ]; then
  echo "NODE_NOT_FOUND"
  exit 0
fi

node_version="\$("\${node_path}" --version 2>/dev/null || echo 'unknown')"
echo "NODE_FOUND|\${node_path}|\${node_version}"
`;

const LOOP_TASK_PROBE_SCRIPT = `
if command -v loop-task >/dev/null 2>&1; then
  echo "LOOP_TASK_FOUND"
else
  echo "LOOP_TASK_NOT_FOUND"
fi
`;

const DAEMON_PROBE_SCRIPT = `
# Check for running loop-task daemon
loop_pid="$(pgrep -f 'loop-task' 2>/dev/null || true)"
if [ -n "\${loop_pid}" ]; then
  # loop-task may listen on multiple ports (HTTP API on 8845, MCP on 8846).
  # We want the HTTP API port. Collect all ports, prefer 8845, then probe.
  all_ports="$(ss -tlnp 2>/dev/null | grep "\${loop_pid}" | grep -oP '(?<=:)\\d+' | sort -u 2>/dev/null || true)"
  if [ -z "\${all_ports}" ]; then
    # Try lsof fallback
    all_ports="$(lsof -Pan -p "\${loop_pid}" -i 2>/dev/null | grep LISTEN | grep -oP '(?<=:)\\d+' | sort -u 2>/dev/null || true)"
  fi
  if [ -n "\${all_ports}" ]; then
    found_port=""
    # Prefer port 8845 (default HTTP API) if present
    for p in \${all_ports}; do
      if [ "\${p}" = "8845" ]; then
        found_port="\${p}"
        break
      fi
    done
    # Otherwise probe each port for /api/loops (HTTP API endpoint)
    if [ -z "\${found_port}" ]; then
      for p in \${all_ports}; do
        if curl -sS -o /dev/null --connect-timeout 1 "http://127.0.0.1:\${p}/api/loops" 2>/dev/null; then
          found_port="\${p}"
          break
        fi
      done
    fi
    if [ -n "\${found_port}" ]; then
      echo "DAEMON_RUNNING|\${found_port}"
    else
      # Fallback: first port found
      echo "DAEMON_RUNNING|\$(echo \${all_ports} | head -1)"
    fi
  else
    echo "DAEMON_RUNNING_UNKNOWN_PORT"
  fi
else
  echo "DAEMON_NOT_RUNNING"
fi

# Check for running opencode server
oc_pid="$(pgrep -f 'opencode.*serve' 2>/dev/null || true)"
if [ -n "\${oc_pid}" ]; then
  oc_port="$(ss -tlnp 2>/dev/null | grep "\${oc_pid}" | grep -oP '(?<=:)\\d+' | head -1 || true)"
  if [ -n "\${oc_port}" ]; then
    echo "OPENCODE_RUNNING|\${oc_port}"
  else
    echo "OPENCODE_RUNNING_UNKNOWN_PORT"
  fi
else
  echo "OPENCODE_NOT_RUNNING"
fi

# Check launch state dir
if [ -d "\${HOME}/.orbion/ssh-launch" ]; then
  echo "LAUNCH_STATE_EXISTS"
fi
`;

// Detects which optional tools are already installed on the VM.
// Generated dynamically from TOOL_DEFINITIONS — adding a tool there
// automatically adds a check_tool line here.
// Sources shell profile files so PATH includes mise/nvm/npm-global paths.
const TOOLS_PROBE_SCRIPT = `
# Load profile files so PATH includes mise/nvm/fnm/npm-global paths
[ -f ~/.profile ] && . ~/.profile 2>/dev/null
[ -f ~/.bashrc ] && . ~/.bashrc 2>/dev/null
[ -f ~/.bash_profile ] && . ~/.bash_profile 2>/dev/null
# mise
[ -f ~/.local/bin/mise ] && eval "$(~/.local/bin/mise activate bash 2>/dev/null)" 2>/dev/null

# Each line: TOOL_INSTALLED|<name> or TOOL_MISSING|<name>
check_tool() {
  local name="\$1"
  shift
  if command -v "\$1" >/dev/null 2>&1; then
    echo "TOOL_INSTALLED|\${name}"
  else
    echo "TOOL_MISSING|\${name}"
  fi
}

${TOOL_DEFINITIONS.map((t) => `check_tool "${t.id}" "${t.binary}"`).join("\n")}
`;

export async function probeVm(host: SshHost): Promise<VmWizardProbeResult> {
  const installedTools: Record<string, boolean> = {};
  for (const tool of TOOL_DEFINITIONS) {
    installedTools[tool.id] = false;
  }

  const result: VmWizardProbeResult = {
    reachable: false,
    authOk: false,
    nodeFound: false,
    nodeVersion: null,
    loopTaskFound: false,
    daemonRunning: false,
    daemonPort: null,
    opencodeRunning: false,
    opencodePort: null,
    installedTools,
    errorDetail: null,
  };

  const nodeResult = await sshExec(host, NODE_PROBE_SCRIPT);

  if (nodeResult.code !== 0) {
    const lower = nodeResult.stderr.toLowerCase();
    if (lower.includes("permission denied") || lower.includes("authentication failed")) {
      result.errorDetail = msg("vmWizard.mainSshAuthFailed");
    } else if (lower.includes("connection refused") || lower.includes("connection timed out")) {
      result.errorDetail = msg("vmWizard.mainCannotReachHost", {
        label: host.label,
        reason: lower.includes("refused") ? "connection refused" : "connection timed out",
      });
    } else {
      result.errorDetail = msg("vmWizard.mainSshFailed", { code: nodeResult.code });
    }
    return result;
  }

  result.reachable = true;
  result.authOk = true;

  for (const line of nodeResult.stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("NODE_FOUND|")) {
      const parts = trimmed.split("|");
      result.nodeFound = true;
      result.nodeVersion = parts[2] ?? null;
    }
  }

  const loopTaskResult = await sshExec(host, LOOP_TASK_PROBE_SCRIPT);
  result.loopTaskFound = loopTaskResult.stdout
    .split("\n")
    .some((line) => line.trim() === "LOOP_TASK_FOUND");

  const daemonResult = await sshExec(host, DAEMON_PROBE_SCRIPT);

  for (const line of daemonResult.stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("DAEMON_RUNNING|")) {
      const port = parseInt(trimmed.split("|")[1] ?? "", 10);
      result.loopTaskFound = true;
      result.daemonRunning = true;
      result.daemonPort = isNaN(port) ? null : port;
    } else if (trimmed === "DAEMON_RUNNING_UNKNOWN_PORT") {
      result.loopTaskFound = true;
      result.daemonRunning = true;
      result.daemonPort = null;
    } else if (trimmed.startsWith("OPENCODE_RUNNING|")) {
      const port = parseInt(trimmed.split("|")[1] ?? "", 10);
      result.opencodeRunning = true;
      result.opencodePort = isNaN(port) ? null : port;
    } else if (trimmed === "OPENCODE_RUNNING_UNKNOWN_PORT") {
      result.opencodeRunning = true;
      result.opencodePort = null;
    }
  }

  // Detect which optional tools are already installed
  const toolsResult = await sshExec(host, TOOLS_PROBE_SCRIPT);
  for (const line of toolsResult.stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("TOOL_INSTALLED|")) continue;
    const toolId = trimmed.split("|")[1];
    if (toolId) {
      result.installedTools[toolId] = true;
    }
  }

  if (result.nodeVersion && compareSemver(result.nodeVersion, NODE_VERSION_FLOOR) < 0) {
    result.errorDetail = msg("vmWizard.mainNodeTooOld", {
      version: result.nodeVersion,
      floor: NODE_VERSION_FLOOR,
    });
  }

  return result;
}

export { sshExec, compareSemver };

const MISE_INSTALL_SCRIPT = `
set -e

MISE_BIN="\${HOME}/.local/bin/mise"

# Install mise if not present
if [ ! -x "\${MISE_BIN}" ]; then
  if ! command -v curl >/dev/null 2>&1; then
    echo "MISE_INSTALL_FAILED|curl is required to install mise"
    exit 0
  fi
  # ── Integrity-verified install (replaces curl-pipe-sh) ───────
  # See: https://github.com/orbion/orbion/issues/51
  __VERIFIED_INSTALL_FN__
  verified_install "__MISE_URL__" "__MISE_SHA__" "/tmp/orbion-mise-install.log" || {
    echo "MISE_INSTALL_FAILED|mise install script failed"
    exit 0
  }
fi

# Activate mise and install Node LTS
export PATH="\${HOME}/.local/bin:\${PATH}"
"\${MISE_BIN}" use --global node@22 || {
  echo "MISE_INSTALL_FAILED|mise could not install node@22"
  exit 0
}

# Verify
node_path="\$(\${MISE_BIN} exec node -- which node 2>/dev/null || echo '')"
if [ -z "\${node_path}" ]; then
  node_path="\$(command -v node 2>/dev/null || echo '')"
fi
node_version="\$("\${node_path}" --version 2>/dev/null || echo 'unknown')"

if [ -z "\${node_path}" ]; then
  echo "MISE_INSTALL_FAILED|node not found after mise install"
  exit 0
fi

echo "MISE_NODE_INSTALLED|\${node_path}|\${node_version}"
`;

export interface MiseInstallResult {
  success: boolean;
  nodePath: string | null;
  nodeVersion: string | null;
  errorDetail: I18nMessage | null;
}

export async function installNodeViaMise(host: SshHost): Promise<MiseInstallResult> {
  const result: MiseInstallResult = {
    success: false,
    nodePath: null,
    nodeVersion: null,
    errorDetail: null,
  };

  const script = MISE_INSTALL_SCRIPT
    .replace(/__VERIFIED_INSTALL_FN__/g, VERIFIED_INSTALL_FN)
    .replace(/__MISE_URL__/g, MISE_INSTALL.url)
    .replace(/__MISE_SHA__/g, MISE_INSTALL.sha256);
  const installResult = await sshExec(host, script, 120_000);

  for (const line of installResult.stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("MISE_NODE_INSTALLED|")) {
      const parts = trimmed.split("|");
      result.success = true;
      result.nodePath = parts[1] ?? null;
      result.nodeVersion = parts[2] ?? null;
    } else if (trimmed.startsWith("MISE_INSTALL_FAILED|")) {
      result.errorDetail = msg("vmWizard.mainMiseInstallFailed");
    }
  }

  if (!result.success && !result.errorDetail) {
    result.errorDetail = msg("vmWizard.mainMiseInstallFailedNoOutput");
  }

  return result;
}
