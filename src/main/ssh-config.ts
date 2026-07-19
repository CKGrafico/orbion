import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile, execFileSync } from "node:child_process";
import type { SshHost } from "../shared/ipc.js";

interface RawHost {
  Host: string;
  HostName?: string;
  User?: string;
  Port?: string;
  IdentityFile?: string;
}

// ─── SSH Input Validation ────────────────────────────────────────────
// Prevents shell injection / argument injection by rejecting values that
// contain whitespace, shell metacharacters, or leading dashes (which
// could be interpreted as SSH flags).
//
// - hostname:  letters, digits, dots, hyphens (not leading).  No spaces.
// - username:  letters, digits, underscores, hyphens (not leading).
// - identityFile: filesystem path — alphanumerics, / _ . - ~
//   Must not start with a dash.

const HOSTNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9.-]*$/;
const USERNAME_RE = /^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/;
const IDENTITY_FILE_RE = /^[a-zA-Z0-9/~][a-zA-Z0-9/_.~-]*$/;

export class SshValidationError extends Error {
  constructor(field: string, value: string) {
    super(`Invalid SSH ${field}: "${value}" contains disallowed characters`);
    this.name = "SshValidationError";
  }
}

/**
 * Validate an SshHost's fields for safe use in SSH argument construction.
 * Throws SshValidationError if any field contains disallowed characters.
 */
export function validateSshHost(host: SshHost): void {
  if (!host.hostName || !HOSTNAME_RE.test(host.hostName)) {
    throw new SshValidationError("hostName", host.hostName);
  }

  if (!host.user || !USERNAME_RE.test(host.user)) {
    throw new SshValidationError("user", host.user);
  }

  // The `host` alias (from ssh-config) must also be safe — it's used as
  // hostName when HostName is absent, and in label construction.
  if (!host.host || !HOSTNAME_RE.test(host.host)) {
    throw new SshValidationError("host", host.host);
  }

  if (host.identityFile !== undefined && host.identityFile !== "") {
    if (!IDENTITY_FILE_RE.test(host.identityFile)) {
      throw new SshValidationError("identityFile", host.identityFile);
    }
  }
}

function sshConfigPath(): string {
  const home = os.homedir();
  return path.join(home, ".ssh", "config");
}

function parseSshConfig(raw: string): RawHost[] {
  const hosts: RawHost[] = [];
  let current: RawHost | null = null;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed.length === 0) continue;

    const match = /^\s*(\S+)\s+(.+)$/.exec(trimmed);
    if (!match) continue;

    const key = match[1];
    const value = match[2].trim();

    if (key === "Host" || key === "Match") {
      if (current) hosts.push(current);
      current = { Host: value };
      continue;
    }

    if (!current) continue;
    if (key === "HostName") current.HostName = value;
    else if (key === "User") current.User = value;
    else if (key === "Port") current.Port = value;
    else if (key === "IdentityFile") current.IdentityFile = value;
  }

  if (current) hosts.push(current);
  return hosts;
}

function expandPath(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

export function listSshHosts(): SshHost[] {
  const configPath = sshConfigPath();
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch {
    return [];
  }

  const parsed = parseSshConfig(raw);
  const result: SshHost[] = [];

  for (const h of parsed) {
    if (h.Host.includes("*") || h.Host.includes("?")) continue;
    if (!h.HostName && !h.Host.match(/^[a-zA-Z0-9.-]+$/)) continue;

    const hostName = h.HostName ?? h.Host;
    const user = h.User ?? "root";
    const port = h.Port ? parseInt(h.Port, 10) : 22;
    const identityFile = h.IdentityFile ? expandPath(h.IdentityFile) : undefined;

    const host: SshHost = {
      host: h.Host,
      hostName,
      user,
      port,
      identityFile,
      label: `${user}@${hostName}${port !== 22 ? `:${port}` : ""}`,
    };

    // Skip hosts with dangerous characters in any field
    try {
      validateSshHost(host);
    } catch {
      continue;
    }

    result.push(host);
  }

  return result;
}

export function parseTarget(target: string): SshHost | null {
  const m = /^([^@]+)@([^:]+)(?::(\d+))?$/.exec(target.trim());
  if (!m) return null;

  const host: SshHost = {
    host: m[2],
    hostName: m[2],
    user: m[1],
    port: m[3] ? parseInt(m[3], 10) : 22,
    label: target.trim(),
  };

  // Reject if user or hostName contains dangerous characters
  try {
    validateSshHost(host);
  } catch {
    return null;
  }

  return host;
}

export function buildSshArgs(host: SshHost, command: string): string[] {
  validateSshHost(host);

  const args: string[] = [];

  if (host.identityFile) {
    args.push("-i", host.identityFile);
  }
  if (host.port !== 22) {
    args.push("-p", String(host.port));
  }

  args.push("-o", "StrictHostKeyChecking=yes");
  args.push("-o", "ConnectTimeout=10");
  args.push("-o", "BatchMode=yes");

  args.push(`${host.user}@${host.hostName}`);
  args.push(command);

  return args;
}

// ─── Known hosts management ──────────────────────────────────────────
// Host key verification replaces the insecure StrictHostKeyChecking=accept-new
// with explicit user confirmation on first connection, followed by
// standard known_hosts verification on all subsequent connections.

/** Return the path to the user's ~/.ssh/known_hosts file. */
export function knownHostsPath(): string {
  return path.join(os.homedir(), ".ssh", "known_hosts");
}

/**
 * Check if a host already has an entry in ~/.ssh/known_hosts.
 * Uses `ssh-keygen -F` for reliable matching (handles hashed known_hosts).
 */
export function isHostInKnownHosts(hostName: string, port: number): boolean {
  const searchKey = port === 22 ? hostName : `[${hostName}]:${port}`;

  if (!HOSTNAME_RE.test(hostName)) return false;

  try {
    const result = execFileSync("ssh-keygen", ["-F", searchKey, "-f", knownHostsPath()], {
      timeout: 5_000,
      encoding: "utf8",
    });
    return result.includes(searchKey);
  } catch {
    return false;
  }
}

/**
 * Append a verified host key line to ~/.ssh/known_hosts.
 * Creates the ~/.ssh/ directory (mode 0700) and known_hosts file if absent.
 */
export function appendToKnownHosts(keyLine: string): void {
  const sshDir = path.join(os.homedir(), ".ssh");
  const khPath = knownHostsPath();

  if (!fs.existsSync(sshDir)) {
    fs.mkdirSync(sshDir, { recursive: true, mode: 0o700 });
  }

  // Ensure the line ends with a newline
  const line = keyLine.endsWith("\n") ? keyLine : `${keyLine}\n`;

  fs.appendFileSync(khPath, line, { encoding: "utf8", mode: 0o644 });
}

/** Result of fetching a host key via ssh-keyscan. */
export interface HostKeyResult {
  /** Raw keyscan output lines (e.g. "[host]:port ssh-ed25519 AAAA...") */
  rawLines: string;
  /** Human-readable fingerprint (e.g. "SHA256:abc123..."), null if unavailable */
  fingerprint: string | null;
}

/**
 * Fetch the host key for a host:port using ssh-keyscan.
 * This is safe: ssh-keyscan does not authenticate or open an SSH session.
 * Returns null if the host is unreachable or keyscan fails.
 */
export async function fetchHostKey(hostName: string, port: number): Promise<HostKeyResult | null> {
  if (!HOSTNAME_RE.test(hostName)) return null;

  const keyscanArgs: string[] = ["-T", "10"];
  if (port !== 22) {
    keyscanArgs.push("-p", String(port));
  }
  keyscanArgs.push(hostName);

  const rawLines = await new Promise<string>((resolve) => {
    execFile("ssh-keyscan", keyscanArgs, { timeout: 15_000 }, (err, stdout) => {
      if (err || !stdout?.trim()) {
        resolve("");
        return;
      }
      resolve(stdout.trim());
    });
  });

  if (!rawLines) return null;

  // Derive the human-readable fingerprint via ssh-keygen -lf -
  let fingerprint: string | null = null;
  try {
    fingerprint = await new Promise<string | null>((resolve) => {
      const proc = execFile("ssh-keygen", ["-lf", "-"], { timeout: 5_000 }, (err, stdout) => {
        if (err || !stdout?.trim()) {
          resolve(null);
          return;
        }
        // ssh-keygen may output multiple lines for multiple key types;
        // return the first one (typically the strongest)
        const first = stdout.trim().split("\n")[0]?.trim() ?? null;
        resolve(first);
      });
      // Feed the keyscan output as stdin to ssh-keygen
      proc.stdin?.end(rawLines);
    });
  } catch {
    fingerprint = null;
  }

  return { rawLines, fingerprint };
}
