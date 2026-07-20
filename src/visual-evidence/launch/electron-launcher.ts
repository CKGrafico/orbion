/**
 * Launch the Orbion Electron app under Playwright for deterministic
 * visual-evidence capture.
 *
 * - Builds the app first (`pnpm build`) unless the build output exists or
 *   `ORBION_VISUAL_EVIDENCE_SKIP_BUILD=1` is set.
 * - Uses a temp Electron user-data dir (no saved bounds, no credentials, no
 *   personal state).
 * - Pre-writes `window-bounds.json` so the launched window is exactly the
 *   configured size.
 * - Sets `ELECTRON_DISABLE_SECURITY_WARNINGS` to silence noisy console output.
 *
 * Returns the Playwright `ElectronApplication` + first `Page`. The caller
 * owns closing the app.
 */
import { _electron as electron } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { VisualEvidenceConfig } from "../config.js";
import type { TempPaths } from "./deterministic-env.js";

const requireFromCjs = createRequire(import.meta.url);

interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

export interface LaunchedApp {
  readonly app: import("playwright").ElectronApplication;
  readonly window: import("playwright").Page;
}

function electronBinaryPath(repoRoot: string): string {
  // pnpm symlinks node_modules/electron → .pnpm/electron@*/node_modules/electron
  // electron/index.js exports the binary path string (CJS).
  const electronPkg = path.join(repoRoot, "node_modules", "electron");
  try {
    const resolved = requireFromCjs(electronPkg) as unknown as string;
    if (!fs.existsSync(resolved)) {
      throw new Error(`Electron binary path resolved to "${resolved}" but the file does not exist. If you are on Linux, the system may need GUI libraries (libatk, libgtk-3, etc.) — see SKILL.md.`);
    }
    return resolved;
  } catch (err) {
    throw new Error(
      `Failed to resolve Electron binary path. Ensure 'electron' is installed in node_modules/electron.\n  Underlying error: ${(err as Error).message}`,
    );
  }
}

function outputExists(repoRoot: string): boolean {
  return fs.existsSync(path.join(repoRoot, "out", "main", "index.js"));
}

/** Run `pnpm build`; resolves on success, rejects with stderr on failure. */
export function buildApp(repoRoot: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const result = spawn("pnpm", ["build"], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    let stderr = "";
    result.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString("utf8");
    });
    result.on("error", (err: Error) => reject(new Error(`Failed to spawn 'pnpm build': ${err.message}`)));
    result.on("close", (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`'pnpm build' failed with exit ${code}\n${stderr.slice(-2000)}`));
    });
  });
}

export async function ensureBuilt(repoRoot: string, opts?: { skip?: boolean }): Promise<void> {
  if (opts?.skip) return;
  if (outputExists(repoRoot)) return;
  await buildApp(repoRoot);
}

/** Pre-write the window-bounds.json so the launched window is deterministic. */
function prepareUserData(paths: TempPaths, config: VisualEvidenceConfig): void {
  const bounds: WindowBounds = {
    width: config.window.width,
    height: config.window.height,
    maximized: false,
  };
  fs.writeFileSync(path.join(paths.userDataDir, "window-bounds.json"), JSON.stringify(bounds));
}

/**
 * Launch the Electron app. Caller must call `app.close()` when done.
 */
export async function launchElectronApp(
  repoRoot: string,
  paths: TempPaths,
  config: VisualEvidenceConfig,
  opts?: { skipBuild?: boolean },
): Promise<LaunchedApp> {
  await ensureBuilt(repoRoot, { skip: opts?.skipBuild ?? process.env.ORBION_VISUAL_EVIDENCE_SKIP_BUILD === "1" });
  prepareUserData(paths, config);

  const executablePath = electronBinaryPath(repoRoot);
  const mainEntry = path.join(repoRoot, "out", "main", "index.js");
  if (!fs.existsSync(mainEntry)) {
    throw new Error(
      `Built main entry not found at ${mainEntry}. Run 'pnpm build' first or unset ORBION_VISUAL_EVIDENCE_SKIP_BUILD.`,
    );
  }

  let app: import("playwright").ElectronApplication;
  try {
    app = await electron.launch({
      executablePath,
      args: [mainEntry, `--user-data-dir=${paths.userDataDir}`],
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
        ORBION_VISUAL_EVIDENCE: "1",
        LANG: process.env.LANG ?? "en_US.UTF-8",
        TZ: process.env.TZ ?? "UTC",
      },
      cwd: repoRoot,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to launch Electron app: ${msg}. On headless Linux, install the required system GUI libraries (libatk1.0-0 libcups2 libgtk-3-0 libnss3 etc.; see SKILL.md) and run under xvfb-run.`,
    );
  }

  const window = await app.firstWindow();

  // Force the viewport to a deterministic size regardless of any platform chrome.
  try {
    await window.setViewportSize({ width: config.window.width, height: config.window.height });
  } catch {
    // Best-effort — ignore if headless/unsupported
  }

  return { app, window };
}
