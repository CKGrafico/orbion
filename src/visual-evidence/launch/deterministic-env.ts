import fs from "node:fs";
import path from "node:path";
import type { VisualEvidenceConfig } from "../config.js";

export interface TempPaths {
  readonly root: string;
  readonly failureScreenshot: string;
  readonly video: string;
  readonly trace: string;
  readonly framesDir: string;
  readonly logsDir: string;
  readonly userDataDir: string;
  readonly screenshotOut: string;
  readonly gifOut: string;
}

function rmrf(dir: string): void {
  if (!fs.existsSync(dir)) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
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

export function tracePath(paths: TempPaths): string {
  return paths.trace;
}
