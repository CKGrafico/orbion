import { execFile } from "node:child_process";
import type { PlatformType } from "../shared/ipc.js";

export interface PlatformDetection {
  platform: PlatformType;
  remotes: string[];
}

/** If *any* remote matches a known platform, that platform is returned.
 *  If remotes match *multiple* known platforms, the first match wins (in order: github → ado).
 *  Unknown or empty remotes yield `"unknown"`. */
export function classifyPlatform(remoteUrls: string[]): PlatformType {
  for (const url of remoteUrls) {
    const lower = url.toLowerCase();

    if (lower.includes("github.com")) {
      return "github";
    }

    if (lower.includes("dev.azure.com") || lower.includes("ssh.dev.azure.com")) {
      return "ado";
    }
  }

  return "unknown";
}

/** Parse `git remote -v` output into unique remote URLs (deduped — fetch and push with the same URL produce one entry). */
export function parseGitRemoteOutput(output: string): string[] {
  const urls = new Set<string>();

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const tabIdx = trimmed.indexOf("\t");
    if (tabIdx === -1) continue;

    const afterTab = trimmed.slice(tabIdx + 1);
    const parenIdx = afterTab.lastIndexOf(" (");
    const url = parenIdx !== -1 ? afterTab.slice(0, parenIdx).trim() : afterTab.trim();

    if (url) urls.add(url);
  }

  return [...urls];
}

export const platformCache = new Map<string, PlatformType>();

export function platformCacheKey(environmentId: string, projectId: string): string {
  return `${environmentId}:${projectId}`;
}

/** Detect the hosting platform by inspecting git remotes. Falls back to `{ platform: "unknown", remotes: [] }` on failure. */
export function detectPlatform(directory: string): Promise<PlatformDetection> {
  return new Promise((resolve) => {
    execFile("git", ["remote", "-v"], { cwd: directory, timeout: 10_000 }, (err, stdout) => {
      if (err) {
        resolve({ platform: "unknown", remotes: [] });
        return;
      }
      const urls = parseGitRemoteOutput(stdout);
      resolve({
        platform: classifyPlatform(urls),
        remotes: urls,
      });
    });
  });
}
