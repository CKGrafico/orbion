import crypto from "node:crypto";
import type { SshHost, VmWizardLaunchResult } from "../shared/ipc.js";
import { sshExec } from "./ssh-probe.js";
import { validateSshHost } from "./ssh-config.js";
import { msg } from "./i18n.js";

const DEFAULT_DAEMON_PORT = 8845;
const DEFAULT_OPENCODE_PORT = 13284;

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

function hashForHost(host: SshHost): string {
  validateSshHost(host);
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
    "$NODE_BIN" -e "const { execSync } = require('child_process'); execSync('npm install -g loop-task', { stdio: 'inherit' });" 2>"$LAUNCH_DIR/install.log" || {
      echo "INSTALL_FAILED_LOOP_TASK"
      cat "$LAUNCH_DIR/install.log" 2>/dev/null
      exit 1
    }
    echo "LOOP_TASK_INSTALLED"
  fi
fi

INSTALL_OPENCODE="__INSTALL_OPENCODE__"
if [ -n "$INSTALL_OPENCODE" ]; then
  if ! command -v opencode >/dev/null 2>&1; then
    echo "OPENCODE_INSTALLING"
    "$NODE_BIN" -e "const { execSync } = require('child_process'); execSync('npm install -g opencode', { stdio: 'inherit' });" 2>"$LAUNCH_DIR/install-oc.log" || {
      echo "INSTALL_FAILED_OPENCODE"
      cat "$LAUNCH_DIR/install-oc.log" 2>/dev/null
      exit 1
    }
    echo "OPENCODE_INSTALLED"
  fi
fi

# ── Optional: gh CLI (GitHub) ────────────────────────────────────
INSTALL_GH="__INSTALL_GH__"
if [ -n "$INSTALL_GH" ]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "GH_INSTALLING"
    if command -v apt-get >/dev/null 2>&1; then
      type -p wget >/dev/null || (apt-get update -qq && apt-get install -y -qq wget)
      wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null
      chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
      apt-get update -qq && apt-get install -y -qq gh 2>"$LAUNCH_DIR/install-gh.log" || { echo "INSTALL_FAILED_GH"; exit 1; }
    elif command -v brew >/dev/null 2>&1; then
      brew install gh 2>"$LAUNCH_DIR/install-gh.log" || { echo "INSTALL_FAILED_GH"; exit 1; }
    else
      echo "INSTALL_FAILED_GH|no apt-get or brew found"; exit 1
    fi
    echo "GH_INSTALLED"
  fi
fi

# ── Optional: Azure DevOps CLI ───────────────────────────────────
INSTALL_AZDO="__INSTALL_AZDO__"
if [ -n "$INSTALL_AZDO" ]; then
  if ! command -v az >/dev/null 2>&1; then
    echo "AZDO_INSTALLING"
    if command -v pip3 >/dev/null 2>&1; then
      pip3 install azure-cli 2>"$LAUNCH_DIR/install-az.log" || { echo "INSTALL_FAILED_AZDO"; exit 1; }
    elif command -v apt-get >/dev/null 2>&1; then
      apt-get update -qq && apt-get install -y -qq azure-cli 2>"$LAUNCH_DIR/install-az.log" || { echo "INSTALL_FAILED_AZDO"; exit 1; }
    else
      echo "INSTALL_FAILED_AZDO|no pip3 or apt-get found"; exit 1
    fi
    az extension add --name azure-devops 2>/dev/null || true
    echo "AZDO_INSTALLED"
  fi
fi

# ── Optional: Jira CLI (acli) ────────────────────────────────────
INSTALL_JIRA="__INSTALL_JIRA__"
if [ -n "$INSTALL_JIRA" ]; then
  if ! command -v acli >/dev/null 2>&1; then
    echo "JIRA_INSTALLING"
    "$NODE_BIN" -e "const { execSync } = require('child_process'); execSync('npm install -g @atlassian/acli', { stdio: 'inherit' });" 2>"$LAUNCH_DIR/install-jira.log" || { echo "INSTALL_FAILED_JIRA"; exit 1; }
    echo "JIRA_INSTALLED"
  fi
fi

# ── Optional: GitLab CLI (glab) ──────────────────────────────────
INSTALL_GITLAB="__INSTALL_GITLAB__"
if [ -n "$INSTALL_GITLAB" ]; then
  if ! command -v glab >/dev/null 2>&1; then
    echo "GITLAB_INSTALLING"
    "$NODE_BIN" -e "const { execSync } = require('child_process'); execSync('npm install -g @gitlab-org/cli', { stdio: 'inherit' });" 2>"$LAUNCH_DIR/install-glab.log" || { echo "INSTALL_FAILED_GITLAB"; exit 1; }
    echo "GITLAB_INSTALLED"
  fi
fi

# ── Optional: Docker ─────────────────────────────────────────────
INSTALL_DOCKER="__INSTALL_DOCKER__"
if [ -n "$INSTALL_DOCKER" ]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "DOCKER_INSTALLING"
    if command -v apt-get >/dev/null 2>&1; then
      apt-get update -qq && apt-get install -y -qq docker.io 2>"$LAUNCH_DIR/install-docker.log" || { echo "INSTALL_FAILED_DOCKER"; exit 1; }
    elif command -v snap >/dev/null 2>&1; then
      snap install docker 2>"$LAUNCH_DIR/install-docker.log" || { echo "INSTALL_FAILED_DOCKER"; exit 1; }
    else
      echo "INSTALL_FAILED_DOCKER|no apt-get or snap found"; exit 1
    fi
    echo "DOCKER_INSTALLED"
  fi
fi

# ── Optional: Terraform ──────────────────────────────────────────
INSTALL_TERRAFORM="__INSTALL_TERRAFORM__"
if [ -n "$INSTALL_TERRAFORM" ]; then
  if ! command -v terraform >/dev/null 2>&1; then
    echo "TERRAFORM_INSTALLING"
    if command -v apt-get >/dev/null 2>&1; then
      wget -qO- https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg 2>/dev/null
      echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/hashicorp.list > /dev/null
      apt-get update -qq && apt-get install -y -qq terraform 2>"$LAUNCH_DIR/install-tf.log" || { echo "INSTALL_FAILED_TERRAFORM"; exit 1; }
    elif command -v brew >/dev/null 2>&1; then
      brew install terraform 2>"$LAUNCH_DIR/install-tf.log" || { echo "INSTALL_FAILED_TERRAFORM"; exit 1; }
    else
      echo "INSTALL_FAILED_TERRAFORM|no apt-get or brew found"; exit 1
    fi
    echo "TERRAFORM_INSTALLED"
  fi
fi

# ── Optional: Tailscale ──────────────────────────────────────────
INSTALL_TAILSCALE="__INSTALL_TAILSCALE__"
if [ -n "$INSTALL_TAILSCALE" ]; then
  if ! command -v tailscale >/dev/null 2>&1; then
    echo "TAILSCALE_INSTALLING"
    curl -fsSL https://tailscale.com/install.sh | sh 2>"$LAUNCH_DIR/install-tailscale.log" || { echo "INSTALL_FAILED_TAILSCALE"; exit 1; }
    echo "TAILSCALE_INSTALLED"
  fi
fi

# ── Optional: Claude CLI ─────────────────────────────────────────
INSTALL_CLAUDE="__INSTALL_CLAUDE__"
if [ -n "$INSTALL_CLAUDE" ]; then
  if ! command -v claude >/dev/null 2>&1; then
    echo "CLAUDE_INSTALLING"
    "$NODE_BIN" -e "const { execSync } = require('child_process'); execSync('npm install -g @anthropic-ai/claude-code', { stdio: 'inherit' });" 2>"$LAUNCH_DIR/install-claude.log" || { echo "INSTALL_FAILED_CLAUDE"; exit 1; }
    echo "CLAUDE_INSTALLED"
  fi
fi

# ── Optional: jq ─────────────────────────────────────────────────
INSTALL_JQ="__INSTALL_JQ__"
if [ -n "$INSTALL_JQ" ]; then
  if ! command -v jq >/dev/null 2>&1; then
    echo "JQ_INSTALLING"
    if command -v apt-get >/dev/null 2>&1; then
      apt-get update -qq && apt-get install -y -qq jq 2>"$LAUNCH_DIR/install-jq.log" || { echo "INSTALL_FAILED_JQ"; exit 1; }
    else
      echo "INSTALL_FAILED_JQ|no apt-get found"; exit 1
    fi
    echo "JQ_INSTALLED"
  fi
fi

# ── Optional: ripgrep ────────────────────────────────────────────
INSTALL_RIPGREP="__INSTALL_RIPGREP__"
if [ -n "$INSTALL_RIPGREP" ]; then
  if ! command -v rg >/dev/null 2>&1; then
    echo "RIPGREP_INSTALLING"
    if command -v apt-get >/dev/null 2>&1; then
      apt-get update -qq && apt-get install -y -qq ripgrep 2>"$LAUNCH_DIR/install-rg.log" || { echo "INSTALL_FAILED_RIPGREP"; exit 1; }
    else
      echo "INSTALL_FAILED_RIPGREP|no apt-get found"; exit 1
    fi
    echo "RIPGREP_INSTALLED"
  fi
fi

# ── Start loop-task daemon (bound to loopback) ───────────────────
if [ -z "$DAEMON_SKIP" ]; then
  echo "DAEMON_STARTING|\${DAEMON_PORT}"
  nohup loop-task serve --host 127.0.0.1 --port "\${DAEMON_PORT}" > "$LAUNCH_DIR/daemon.log" 2>&1 &
  DAEMON_PID=$!
  echo "$DAEMON_PID" > "$LAUNCH_DIR/daemon.pid"
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

const TAIL_LOG_SCRIPT = `
LAUNCH_DIR="$HOME/.orbion/ssh-launch/__HASH__"
if [ -f "$LAUNCH_DIR/daemon.log" ]; then
  tail -20 "$LAUNCH_DIR/daemon.log" 2>/dev/null || true
fi
`;

export async function launchOnVm(
  host: SshHost,
  probeResult: {
    daemonRunning: boolean;
    daemonPort: number | null;
    opencodeRunning: boolean;
    opencodePort: number | null;
    installOpenCode: boolean;
    installGh: boolean;
    installAzDo: boolean;
    installJira: boolean;
    installGitlab: boolean;
    installDocker: boolean;
    installTerraform: boolean;
    installTailscale: boolean;
    installClaudeCli: boolean;
    installJq: boolean;
    installRipgrep: boolean;
  },
): Promise<VmWizardLaunchResult> {
  const result: VmWizardLaunchResult = {
    started: false,
    daemonPort: null,
    opencodePort: null,
    errorDetail: null,
    logTail: null,
    loopTaskStatus: "pending",    // mandatory, always runs
    openCodeStatus: "pending",
    ghStatus: "pending",
    azDoStatus: "pending",
    jiraStatus: "pending",
    gitlabStatus: "pending",
    dockerStatus: "pending",
    terraformStatus: "pending",
    tailscaleStatus: "pending",
    claudeStatus: "pending",
    jqStatus: "pending",
    ripgrepStatus: "pending",
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

  // Validate port numbers before substituting into scripts
  assertSafePort(daemonPort, "daemonPort");
  assertSafePort(opencodePort, "opencodePort");

  if (probeResult.daemonRunning && probeResult.daemonPort) {
    result.started = true;
    result.daemonPort = probeResult.daemonPort;
    result.loopTaskStatus = "already-running";
    result.opencodePort = probeResult.opencodeRunning ? (probeResult.opencodePort ?? DEFAULT_OPENCODE_PORT) : opencodePort;
    result.openCodeStatus = probeResult.opencodeRunning ? "already-running" : "pending";
  }

  if (!probeResult.installOpenCode) result.openCodeStatus = "skipped";
  if (!probeResult.installGh) result.ghStatus = "skipped";
  if (!probeResult.installAzDo) result.azDoStatus = "skipped";
  if (!probeResult.installJira) result.jiraStatus = "skipped";
  if (!probeResult.installGitlab) result.gitlabStatus = "skipped";
  if (!probeResult.installDocker) result.dockerStatus = "skipped";
  if (!probeResult.installTerraform) result.terraformStatus = "skipped";
  if (!probeResult.installTailscale) result.tailscaleStatus = "skipped";
  if (!probeResult.installClaudeCli) result.claudeStatus = "skipped";
  if (!probeResult.installJq) result.jqStatus = "skipped";
  if (!probeResult.installRipgrep) result.ripgrepStatus = "skipped";

  const script = LAUNCH_SCRIPT_TEMPLATE
    .replace(/__HASH__/g, hash)
    .replace(/__DAEMON_PORT__/g, String(daemonPort))
    .replace(/__OPENCODE_PORT__/g, String(opencodePort))
    .replace(/__INSTALL_OPENCODE__/g, probeResult.installOpenCode ? "1" : "")
    .replace(/__INSTALL_GH__/g, probeResult.installGh ? "1" : "")
    .replace(/__INSTALL_AZDO__/g, probeResult.installAzDo ? "1" : "")
    .replace(/__INSTALL_JIRA__/g, probeResult.installJira ? "1" : "")
    .replace(/__INSTALL_GITLAB__/g, probeResult.installGitlab ? "1" : "")
    .replace(/__INSTALL_DOCKER__/g, probeResult.installDocker ? "1" : "")
    .replace(/__INSTALL_TERRAFORM__/g, probeResult.installTerraform ? "1" : "")
    .replace(/__INSTALL_TAILSCALE__/g, probeResult.installTailscale ? "1" : "")
    .replace(/__INSTALL_CLAUDE__/g, probeResult.installClaudeCli ? "1" : "")
    .replace(/__INSTALL_JQ__/g, probeResult.installJq ? "1" : "")
    .replace(/__INSTALL_RIPGREP__/g, probeResult.installRipgrep ? "1" : "");

  const launchResult = await sshExec(host, script);

  if (launchResult.code !== 0) {
    const tailScript = TAIL_LOG_SCRIPT.replace(/__HASH__/g, hash);
    const tailResult = await sshExec(host, tailScript);
    result.logTail = tailResult.stdout.trim() || null;
    result.errorDetail = msg("vmWizard.mainLaunchScriptFailed", { code: launchResult.code });

    for (const line of launchResult.stdout.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "INSTALL_NODE_FIRST") {
        result.errorDetail = msg("vmWizard.mainNodeNotFoundOnVm");
      } else if (trimmed === "INSTALL_FAILED_LOOP_TASK") {
        result.errorDetail = msg("vmWizard.mainInstallLoopTaskFailed");
        result.loopTaskStatus = "failed";
      } else if (trimmed === "INSTALL_FAILED_OPENCODE") {
        result.errorDetail = msg("vmWizard.mainInstallOpenCodeFailed");
        result.openCodeStatus = "failed";
      } else if (trimmed.startsWith("DAEMON_PORT_BUSY|")) {
        result.errorDetail = msg("vmWizard.mainDaemonPortBusy", { port: daemonPort });
      } else if (trimmed.startsWith("OPENCODE_PORT_BUSY|")) {
        result.errorDetail = msg("vmWizard.mainOpenCodePortBusy", { port: opencodePort });
      } else if (trimmed.startsWith("INSTALL_FAILED_GH")) { result.ghStatus = "failed"; }
        else if (trimmed.startsWith("INSTALL_FAILED_AZDO")) { result.azDoStatus = "failed"; }
        else if (trimmed.startsWith("INSTALL_FAILED_JIRA")) { result.jiraStatus = "failed"; }
        else if (trimmed.startsWith("INSTALL_FAILED_GITLAB")) { result.gitlabStatus = "failed"; }
        else if (trimmed.startsWith("INSTALL_FAILED_DOCKER")) { result.dockerStatus = "failed"; }
        else if (trimmed.startsWith("INSTALL_FAILED_TERRAFORM")) { result.terraformStatus = "failed"; }
        else if (trimmed.startsWith("INSTALL_FAILED_TAILSCALE")) { result.tailscaleStatus = "failed"; }
        else if (trimmed.startsWith("INSTALL_FAILED_CLAUDE")) { result.claudeStatus = "failed"; }
        else if (trimmed.startsWith("INSTALL_FAILED_JQ")) { result.jqStatus = "failed"; }
        else if (trimmed.startsWith("INSTALL_FAILED_RIPGREP")) { result.ripgrepStatus = "failed"; }
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
    } else if (trimmed === "LOOP_TASK_INSTALLED") { result.loopTaskStatus = "installed"; }
      else if (trimmed.startsWith("OPENCODE_STARTED|")) {
        result.opencodePort = parseInt(trimmed.split("|")[1] ?? String(opencodePort), 10);
        result.openCodeStatus = "started";
      } else if (trimmed === "OPENCODE_INSTALLED") { result.openCodeStatus = "installed"; }
        else if (trimmed.startsWith("OPENCODE_PORT_BUSY|")) { result.opencodePort = null; result.openCodeStatus = "already-running"; }
        else if (trimmed === "GH_INSTALLED") { result.ghStatus = "installed"; }
        else if (trimmed === "AZDO_INSTALLED") { result.azDoStatus = "installed"; }
        else if (trimmed === "JIRA_INSTALLED") { result.jiraStatus = "installed"; }
        else if (trimmed === "GITLAB_INSTALLED") { result.gitlabStatus = "installed"; }
        else if (trimmed === "DOCKER_INSTALLED") { result.dockerStatus = "installed"; }
        else if (trimmed === "TERRAFORM_INSTALLED") { result.terraformStatus = "installed"; }
        else if (trimmed === "TAILSCALE_INSTALLED") { result.tailscaleStatus = "installed"; }
        else if (trimmed === "CLAUDE_INSTALLED") { result.claudeStatus = "installed"; }
        else if (trimmed === "JQ_INSTALLED") { result.jqStatus = "installed"; }
        else if (trimmed === "RIPGREP_INSTALLED") { result.ripgrepStatus = "installed"; }
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
  try {
    validateSshHost(host);
  } catch {
    return null;
  }
  const script = TAIL_LOG_SCRIPT.replace(/__HASH__/g, hash);
  const result = await sshExec(host, script);
  return result.stdout.trim() || null;
}

export { hashForHost };
