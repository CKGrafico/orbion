import { execFile } from "node:child_process";
import type { SshHost, VmWizardProbeResult } from "../shared/ipc.js";
import { buildSshArgs } from "./ssh-config.js";

const NODE_VERSION_FLOOR = "18.0.0";

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

function sshExec(host: SshHost, command: string): Promise<{ stdout: string; stderr: string; code: number }> {
  const args = buildSshArgs(host, command);
  return new Promise((resolve) => {
    execFile("ssh", args, { timeout: 30_000 }, (err, stdout, stderr) => {
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
    latest="\$(find "\${manager_dir}" -maxdepth 3 -name 'node' -path '*/bin/node' 2>/dev/null | sort -V | tail -1)"
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

node_version="\$("\\${node_path}" --version 2>/dev/null || echo 'unknown')"
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
    errorDetail: null,
  };

  const nodeResult = await sshExec(host, NODE_PROBE_SCRIPT);

  if (nodeResult.code !== 0) {
    const lower = nodeResult.stderr.toLowerCase();
    if (lower.includes("permission denied") || lower.includes("authentication failed")) {
      result.errorDetail = "SSH authentication failed. Check your key or password.";
    } else if (lower.includes("connection refused") || lower.includes("connection timed out")) {
      result.errorDetail = `Cannot reach ${host.label}: ${lower.includes("refused") ? "connection refused" : "connection timed out"}.`;
    } else {
      result.errorDetail = nodeResult.stderr.trim() || `SSH failed (exit ${nodeResult.code})`;
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

  if (result.nodeVersion && compareSemver(result.nodeVersion, NODE_VERSION_FLOOR) < 0) {
    result.errorDetail = `Node ${result.nodeVersion} found, but ${NODE_VERSION_FLOOR}+ is required. Update Node on the VM.`;
  }

  return result;
}

export { sshExec, compareSemver };
