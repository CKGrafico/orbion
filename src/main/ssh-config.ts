import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { SshHost } from "../shared/ipc.js";

interface RawHost {
  Host: string;
  HostName?: string;
  User?: string;
  Port?: string;
  IdentityFile?: string;
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

    result.push({
      host: h.Host,
      hostName,
      user,
      port,
      identityFile,
      label: `${user}@${hostName}${port !== 22 ? `:${port}` : ""}`,
    });
  }

  return result;
}

export function parseTarget(target: string): SshHost | null {
  const m = /^([^@]+)@([^:]+)(?::(\d+))?$/.exec(target.trim());
  if (!m) return null;

  return {
    host: m[2],
    hostName: m[2],
    user: m[1],
    port: m[3] ? parseInt(m[3], 10) : 22,
    label: target.trim(),
  };
}

export function buildSshArgs(host: SshHost, command: string): string[] {
  const args: string[] = [];

  if (host.identityFile) {
    args.push("-i", host.identityFile);
  }
  if (host.port !== 22) {
    args.push("-p", String(host.port));
  }

  args.push("-o", "StrictHostKeyChecking=accept-new");
  args.push("-o", "ConnectTimeout=10");
  args.push("-o", "BatchMode=yes");

  args.push(`${host.user}@${host.hostName}`);
  args.push(command);

  return args;
}
