import { execFile } from "node:child_process";
import crypto from "node:crypto";
import type { SshHost, VmWizardLaunchResult } from "../shared/ipc.js";
import { buildSshArgs } from "./ssh-config.js";
import { sshExec } from "./ssh-probe.js";

const DEFAULT_DAEMON_PORT = 8845;
const DEFAULT_OPENCODE_PORT = 13284;

function hashForHost(host: SshHost): string {
  return crypto.createHash("sha256").update(`${host.user}@${host.hostName}:${host.port}`).digest("hex").slice(0, 12);
}

const LAUNCH_SCRIPT_TEMPLATE = `
set -e

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
      latest="$(find "$manager_dir" -maxdepth 3 -name 'node' -path '*/bin/node' 2>/dev/null | sort -V | tail -1)"
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

echo "Node: $NODE_BIN ($($NODE_BIN --version))"

# Check if loop-task daemon is already running on the expected port
DAEMON_PORT=__DAEMON_PORT__
if ss -tlnp 2>/dev/null | grep -q ":''${DAEMON_PORT} "; then
  EXISTING_PID="$(ss -tlnp 2>/dev/null | grep ":''${DAEMON_PORT} " | grep -oP 'pid=\\K[0-9]+' | head -1 || true)"
  if [ -n "$EXISTING_PID" ] && [ -f "$LAUNCH_DIR/.managed" ]; then
    echo "DAEMON_ALREADY_RUNNING|''${DAEMON_PORT}|''${EXISTING_PID}"
  else
    echo "DAEMON_PORT_BUSY|''${DAEMON_PORT}"
  fi
  # Skip daemon launch regardless — never kill/restart what we don't own
  DAEMON_SKIP=1
fi

# Install loop-task if not present
if [ -z "$DAEMON_SKIP" ]; then
  if ! command -v loop-task >/dev/null 2>&1; then
    echo "Installing loop-task..."
    "$NODE_BIN" -e "const { execSync } = require('child_process'); execSync('npm install -g loop-task', { stdio: 'inherit' });" 2>"$LAUNCH_DIR/install.log" || {
      echo "INSTALL_FAILED_LOOP_TASK"
      cat "$LAUNCH_DIR/install.log" 2>/dev/null
      exit 1
    }
  fi
fi

# Install opencode if not present
if ! command -v opencode >/dev/null 2>&1; then
  echo "Installing opencode..."
  "$NODE_BIN" -e "const { execSync } = require('child_process'); execSync('npm install -g opencode', { stdio: 'inherit' });" 2>"$LAUNCH_DIR/install-oc.log" || {
    echo "INSTALL_FAILED_OPENCODE"
    cat "$LAUNCH_DIR/install-oc.log" 2>/dev/null
    exit 1
  }
fi

# Start loop-task daemon (bound to loopback)
if [ -z "$DAEMON_SKIP" ]; then
  echo "Starting loop-task daemon on port ''${DAEMON_PORT}..."
  nohup loop-task serve --host 127.0.0.1 --port "''${DAEMON_PORT}" > "$LAUNCH_DIR/daemon.log" 2>&1 &
  DAEMON_PID=$!
  echo "$DAEMON_PID" > "$LAUNCH_DIR/daemon.pid"
  echo "port=''${DAEMON_PORT}" > "$LAUNCH_DIR/daemon.info"
  echo "DAEMON_STARTED|''${DAEMON_PORT}|''${DAEMON_PID}"
fi

# Start opencode server (bound to loopback)
OPENCODE_PORT=__OPENCODE_PORT__
if ss -tlnp 2>/dev/null | grep -q ":''${OPENCODE_PORT} "; then
  echo "OPENCODE_PORT_BUSY|''${OPENCODE_PORT}"
else
  echo "Starting opencode server on port ''${OPENCODE_PORT}..."
  nohup opencode serve --host 127.0.0.1 --port "''${OPENCODE_PORT}" > "$LAUNCH_DIR/opencode.log" 2>&1 &
  OPENCODE_PID=$!
  echo "$OPENCODE_PID" > "$LAUNCH_DIR/opencode.pid"
  echo "port=''${OPENCODE_PORT}" > "$LAUNCH_DIR/opencode.info"
  echo "OPENCODE_STARTED|''${OPENCODE_PORT}|''${OPENCODE_PID}"
fi

echo "LAUNCH_DONE"
`;

const TAIL_LOG_SCRIPT = `
LAUNCH_DIR="$HOME/.orbion/ssh-launch/__HASH__"
if [ -f "$LAUNCH_DIR/daemon.log" ]; then
  tail -20 "$LAUNCH_DIR/daemon.log" 2>/dev/null || true
fi
`;

export async function launchOnVm(
  host: SshHost,
  probeResult: { daemonRunning: boolean; daemonPort: number | null; opencodeRunning: boolean; opencodePort: number | null },
): Promise<VmWizardLaunchResult> {
  const result: VmWizardLaunchResult = {
    started: false,
    daemonPort: null,
    opencodePort: null,
    errorDetail: null,
    logTail: null,
  };

  const hash = hashForHost(host);
  const daemonPort = probeResult.daemonPort ?? DEFAULT_DAEMON_PORT;
  const opencodePort = probeResult.opencodePort ?? DEFAULT_OPENCODE_PORT;

  if (probeResult.daemonRunning && probeResult.daemonPort) {
    result.started = true;
    result.daemonPort = probeResult.daemonPort;
    result.opencodePort = probeResult.opencodeRunning ? (probeResult.opencodePort ?? DEFAULT_OPENCODE_PORT) : opencodePort;
  }

  const script = LAUNCH_SCRIPT_TEMPLATE
    .replace(/__HASH__/g, hash)
    .replace(/__DAEMON_PORT__/g, String(daemonPort))
    .replace(/__OPENCODE_PORT__/g, String(opencodePort));

  const launchResult = await sshExec(host, script);

  if (launchResult.code !== 0) {
    const tailScript = TAIL_LOG_SCRIPT.replace(/__HASH__/g, hash);
    const tailResult = await sshExec(host, tailScript);
    result.logTail = tailResult.stdout.trim() || null;
    result.errorDetail = launchResult.stderr.trim() || `Launch script failed (exit ${launchResult.code})`;

    for (const line of launchResult.stdout.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "INSTALL_NODE_FIRST") {
        result.errorDetail = "Node.js not found on the VM. Install Node 18+ first.";
      } else if (trimmed === "INSTALL_FAILED_LOOP_TASK") {
        result.errorDetail = "Failed to install loop-task on the VM. Check the remote log for details.";
      } else if (trimmed === "INSTALL_FAILED_OPENCODE") {
        result.errorDetail = "Failed to install opencode on the VM. Check the remote log for details.";
      } else if (trimmed.startsWith("DAEMON_PORT_BUSY|")) {
        result.errorDetail = `Port ${daemonPort} is already in use by another process on the VM. The wizard will not restart a daemon it didn't start.`;
      } else if (trimmed.startsWith("OPENCODE_PORT_BUSY|")) {
        result.errorDetail = `Port ${opencodePort} is already in use by another process on the VM.`;
      }
    }

    return result;
  }

  for (const line of launchResult.stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("DAEMON_ALREADY_RUNNING|")) {
      result.daemonPort = parseInt(trimmed.split("|")[1] ?? String(daemonPort), 10);
    } else if (trimmed.startsWith("DAEMON_STARTED|")) {
      result.daemonPort = parseInt(trimmed.split("|")[1] ?? String(daemonPort), 10);
    } else if (trimmed.startsWith("OPENCODE_STARTED|")) {
      result.opencodePort = parseInt(trimmed.split("|")[1] ?? String(opencodePort), 10);
    } else if (trimmed.startsWith("OPENCODE_PORT_BUSY|")) {
      result.opencodePort = null;
    }
  }

  result.started = true;
  return result;
}

export async function createPairingCodeOnRemote(host: SshHost, daemonPort: number): Promise<string | null> {
  const script = `curl -s http://127.0.0.1:${daemonPort}/api/pair/create 2>/dev/null || echo "PAIR_CREATE_FAILED"`;
  const result = await sshExec(host, script);

  if (result.code !== 0) return null;

  try {
    const parsed = JSON.parse(result.stdout) as { ok?: boolean; code?: string; error?: { message?: string } };
    if (parsed.ok && parsed.code) return parsed.code;
    return null;
  } catch {
    return null;
  }
}

export async function readRemoteLog(host: SshHost, hash: string): Promise<string | null> {
  const script = TAIL_LOG_SCRIPT.replace(/__HASH__/g, hash);
  const result = await sshExec(host, script);
  return result.stdout.trim() || null;
}

export { hashForHost };
