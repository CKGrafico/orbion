/**
 * Launch the Orbion app under Playwright for deterministic visual-evidence
 * capture.
 *
 * Supports two modes:
 *
 * 1. **Web mock mode** (default, `ORBION_VISUAL_EVIDENCE_MODE=web`):
 *    Starts `pnpm dev:web` (Vite dev server on port 5183) which serves the
 *    renderer with the mock adapter (no Electron, no daemon, no real data).
 *    Playwright's headless Chromium navigates to the dev server. This is
 *    fast, fully deterministic, and works on headless Linux without GUI
 *    system libraries.
 *
 * 2. **Electron mode** (`ORBION_VISUAL_EVIDENCE_MODE=electron`):
 *    Builds and launches the real Electron app. Requires system GUI libs
 *    (libatk, libgtk-3, etc.) and xvfb-run on headless Linux.
 *
 * The caller owns closing the app/browser.
 */
import { chromium } from "playwright";
import { spawn, type ChildProcess } from "node:child_process";
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
  /** The Electron app (when in electron mode) or null (web mode). */
  readonly app: import("playwright").ElectronApplication | null;
  /** The browser context backing the page (for tracing/video). */
  readonly context: import("playwright").BrowserContext;
  /** The main window page — either the Electron window or the Chromium tab. */
  readonly window: import("playwright").Page;
  /** Call to shut everything down (browser, dev server, Electron). */
  close: () => Promise<void>;
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

function electronBinaryPath(repoRoot: string): string {
  const electronPkg = path.join(repoRoot, "node_modules", "electron");
  try {
    const resolved = requireFromCjs(electronPkg) as unknown as string;
    if (!fs.existsSync(resolved)) {
      throw new Error(`Electron binary path resolved to "${resolved}" but the file does not exist.`);
    }
    return resolved;
  } catch (err) {
    throw new Error(
      `Failed to resolve Electron binary path. Ensure 'electron' is installed.\n  Underlying error: ${(err as Error).message}`,
    );
  }
}

/**
 * Wait for the React renderer to mount real content inside #root.
 * Works for both Electron and Chromium pages.
 */
async function waitForReactMount(page: import("playwright").Page): Promise<void> {
  try {
    await page.waitForSelector("#root", { state: "attached", timeout: 15_000 });
    await page.waitForFunction(
      () => {
        const root = document.getElementById("root");
        if (!root) return false;
        return root.children.length > 0 && (root.textContent ?? "").trim().length > 0;
      },
      { timeout: 20_000 },
    );
  } catch {
    // Best-effort: assertions will report the failure
  }
}

/**
 * Start the Vite dev server (`pnpm dev:web`) on the configured port and
 * wait for it to be ready.
 */
function startDevServer(repoRoot: string, port: number): { process: ChildProcess; url: string } {
  const proc = spawn("pnpm", ["dev:web", "--port", String(port), "--strictPort"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    env: { ...process.env, ORBION_VISUAL_EVIDENCE: "1" },
  });
  const url = `http://localhost:${port}`;
  return { process: proc, url };
}

/**
 * Wait for the Vite dev server to respond.
 */
async function waitForDevServer(url: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(url);
      if (resp.ok || resp.status === 200) return;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Vite dev server at ${url} did not respond within ${timeoutMs}ms`);
}

/**
 * Launch the app in the mode selected by ORBION_VISUAL_EVIDENCE_MODE.
 *
 * Default: "web" (mock adapter via Vite dev server + headless Chromium).
 *   - Fast, no system GUI libs needed, fully deterministic.
 *   - Works on headless Linux without xvfb.
 *
 * "electron": build + launch the real Electron app.
 *   - Requires system GUI libs + xvfb on headless Linux.
 */
export async function launchElectronApp(
  repoRoot: string,
  paths: TempPaths,
  config: VisualEvidenceConfig,
  opts?: { skipBuild?: boolean },
): Promise<LaunchedApp> {
  const mode = process.env.ORBION_VISUAL_EVIDENCE_MODE ?? "web";

  if (mode === "electron") {
    return launchElectronMode(repoRoot, paths, config, opts);
  }
  return launchWebMode(repoRoot, paths, config);
}

async function launchWebMode(
  repoRoot: string,
  paths: TempPaths,
  config: VisualEvidenceConfig,
): Promise<LaunchedApp> {
  const port = 5183;
  const { process: devProc, url } = startDevServer(repoRoot, port);
  let browser: import("playwright").Browser | null = null;

  try {
    await waitForDevServer(url, 30_000);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: config.window.width, height: config.window.height },
      recordVideo: {
        dir: paths.root,
        size: { width: config.window.width, height: config.window.height },
      },
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
    await waitForReactMount(page);

    return {
      app: null,
      context,
      window: page,
      close: async () => {
        try { await context.close(); } catch { /* ignore */ }
        try { await browser?.close(); } catch { /* ignore */ }
        try { devProc.kill("SIGTERM"); } catch { /* ignore */ }
      },
    };
  } catch (err) {
    try { devProc.kill("SIGTERM"); } catch { /* ignore */ }
    try { await browser?.close(); } catch { /* ignore */ }
    throw err;
  }
}

async function launchElectronMode(
  repoRoot: string,
  paths: TempPaths,
  config: VisualEvidenceConfig,
  opts?: { skipBuild?: boolean },
): Promise<LaunchedApp> {
  // Lazy-import electron only in electron mode (avoids requiring Playwright's
  // electron module in web mode).
  const { _electron: electron } = await import("playwright");

  await ensureBuilt(repoRoot, { skip: opts?.skipBuild ?? process.env.ORBION_VISUAL_EVIDENCE_SKIP_BUILD === "1" });
  prepareUserData(paths, config);

  const executablePath = electronBinaryPath(repoRoot);
  const mainEntry = path.join(repoRoot, "out", "main", "index.js");
  if (!fs.existsSync(mainEntry)) {
    throw new Error(`Built main entry not found at ${mainEntry}. Run 'pnpm build' first.`);
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
      `Failed to launch Electron app: ${msg}. On headless Linux, install the required system GUI libraries (see SKILL.md) and run under xvfb-run, or use ORBION_VISUAL_EVIDENCE_MODE=web.`,
    );
  }

  const window = await app.firstWindow();
  const context = app.context();

  try {
    await window.setViewportSize({ width: config.window.width, height: config.window.height });
  } catch {
    // Best-effort
  }

  await waitForReactMount(window);

  return {
    app,
    context,
    window,
    close: async () => {
      try { await app.close(); } catch { /* ignore */ }
    },
  };
}
