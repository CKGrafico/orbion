import { execFile } from "node:child_process";
import type { SshHost, VmWizardProbeResult, I18nMessage } from "../shared/ipc.js";
import { compareSemver } from "../shared/utils.js";
import { buildSshArgs } from "./ssh-config.js";
import { msg } from "./i18n.js";

const NODE_VERSION_FLOOR = "18.0.0";

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

# Try PATH node first
node_path=""
if command -v node >/dev/null 2>&1; then
  node_path="$(command -v node)"
fi

# Check version managers
for manager_dir in \
  "\${HOME}/.nvm/versions/node" \
  "\${HOME}/.local/share/fnm/node-versions" \
  "\${HOME}/.asdf/installs/nodejs" \
  "\${HOME}/.local/share/mise/installs/node" \
  "\${HOME}/.volta/tools/node"; do
  if [ -d "\${manager_dir}" ]; then
    latest="\$(find "\${manager_dir}" -maxdepth 4 -name 'node' -path '*/bin/node' 2>/dev/null | sort -V | tail -1)"
    if [ -n "\${latest}" ]; then
      node_path="\${latest}"
      break
    fi
  fi
done

if [ -z "\${node_path}" ]; then
  echo "NODE_NOT_FOUND"
  exit 0
fi

node_version="\$("\${node_path}" --version 2>/dev/null || echo 'unknown')"
echo "NODE_FOUND|\${node_path}|\${node_version}"
`;

const DAEMON_PROBE_SCRIPT = `
# Check for running loop-task daemon
loop_pid="$(pgrep -f 'loop-task' 2>/dev/null || true)"
if [ -n "\${loop_pid}" ]; then
  loop_port="$(ss -tlnp 2>/dev/null | grep "\${loop_pid}" | grep -oP '(?<=:)\\d+' | head -1 || true)"
  if [ -n "\${loop_port}" ]; then
    echo "DAEMON_RUNNING|\${loop_port}"
  else
    # Try lsof fallback
    loop_port="$(lsof -Pan -p "\${loop_pid}" -i 2>/dev/null | grep LISTEN | grep -oP '(?<=:)\\d+' | head -1 || true)"
    if [ -n "\${loop_port}" ]; then
      echo "DAEMON_RUNNING|\${loop_port}"
    else
      echo "DAEMON_RUNNING_UNKNOWN_PORT"
    fi
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
const TOOLS_PROBE_SCRIPT = `
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

check_tool gh gh
check_tool azDo az
check_tool jira acli
check_tool gitlab glab
check_tool docker docker
check_tool terraform terraform
check_tool tailscale tailscale
check_tool claude claude
check_tool jq jq
check_tool ripgrep rg
`;

export async function probeVm(host: SshHost): Promise<VmWizardProbeResult> {
  const result: VmWizardProbeResult = {
    reachable: false,
    authOk: false,
    nodeFound: false,
    nodeVersion: null,
    daemonRunning: false,
    daemonPort: null,
    opencodeRunning: false,
    opencodePort: null,
    ghInstalled: false,
    azDoInstalled: false,
    jiraInstalled: false,
    gitlabInstalled: false,
    dockerInstalled: false,
    terraformInstalled: false,
    tailscaleInstalled: false,
    claudeInstalled: false,
    jqInstalled: false,
    ripgrepInstalled: false,
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

  const daemonResult = await sshExec(host, DAEMON_PROBE_SCRIPT);

  for (const line of daemonResult.stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("DAEMON_RUNNING|")) {
      const port = parseInt(trimmed.split("|")[1] ?? "", 10);
      result.daemonRunning = true;
      result.daemonPort = isNaN(port) ? null : port;
    } else if (trimmed === "DAEMON_RUNNING_UNKNOWN_PORT") {
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
    const tool = trimmed.split("|")[1];
    switch (tool) {
      case "gh": result.ghInstalled = true; break;
      case "azDo": result.azDoInstalled = true; break;
      case "jira": result.jiraInstalled = true; break;
      case "gitlab": result.gitlabInstalled = true; break;
      case "docker": result.dockerInstalled = true; break;
      case "terraform": result.terraformInstalled = true; break;
      case "tailscale": result.tailscaleInstalled = true; break;
      case "claude": result.claudeInstalled = true; break;
      case "jq": result.jqInstalled = true; break;
      case "ripgrep": result.ripgrepInstalled = true; break;
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
  curl -fsSL https://mise.run | sh || {
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

  const installResult = await sshExec(host, MISE_INSTALL_SCRIPT, 120_000);

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
