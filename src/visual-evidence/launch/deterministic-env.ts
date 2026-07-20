/**
 * Deterministic temp directory management for visual-evidence runs.
 *
 * All raw artifacts (raw PNGs, webm recordings, Playwright traces, frames,
 * logs, failure captures) live under `.tmp/visual-evidence/<change-id>/`.
 * This directory is gitignored and never committed. Failure artifacts may
 * remain temporarily for debugging but are not promoted to permanent
 * OpenSpec evidence.
 *
 * Each run starts with a clean temp dir for the change (prior contents are
 * removed) so evidence captures stay reproducible.
 */
import fs from "node:fs";
import path from "node:path";
import type { VisualEvidenceConfig } from "../config.js";

export interface TempPaths {
  /** Root: <tempDir>/<changeId>/ */
  readonly root: string;
  readonly failureScreenshot: string;
  readonly video: string;
  readonly trace: string;
  readonly framesDir: string;
  readonly logsDir: string;
  /** Electron user-data dir (separate temp dir, isolated from repo) */
  readonly userDataDir: string;
  /** Final screenshot output (before being promoted to OpenSpec evidence) */
  readonly screenshotOut: string;
  /** Final gif output (before being promoted to OpenSpec evidence) */
  readonly gifOut: string;
}

function rmrf(dir: string): void {
  if (!fs.existsSync(dir)) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best-effort; ignore
  }
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function prepareTempDir(
  repoRoot: string,
  changeId: string,
  config: VisualEvidenceConfig,
  opts?: { clean?: boolean },
): TempPaths {
  const clean = opts?.clean ?? true;
  const root = path.resolve(repoRoot, config.temporaryDirectory, changeId);
  const userDataDir = path.resolve(root, "electron-userdata");

  // On Linux CI the userData dir might persist config-store — clean it too.
  if (clean) {
    rmrf(root);
  }
  ensureDir(root);
  ensureDir(userDataDir);

  const framesDir = path.resolve(root, "frames");
  const logsDir = path.resolve(root, "logs");
  ensureDir(framesDir);
  ensureDir(logsDir);

  return {
    root,
    failureScreenshot: path.resolve(root, "failure.png"),
    video: path.resolve(root, "video.webm"),
    trace: path.resolve(root, "trace.zip"),
    framesDir,
    logsDir,
    userDataDir,
    screenshotOut: path.resolve(root, "final.webp"),
    gifOut: path.resolve(root, "flow.gif"),
  };
}

/** Build the Playwright trace path (used by context.tracing). */
export function tracePath(paths: TempPaths): string {
  return paths.trace;
}
