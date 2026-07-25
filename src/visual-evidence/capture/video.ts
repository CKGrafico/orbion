import path from "node:path";
import type { TempPaths } from "../launch/deterministic-env.js";
import type { VisualEvidenceConfig } from "../config.js";

export interface VideoController {
  stop: () => Promise<string | null>;
}

export function enableVideo(
  page: import("playwright").Page,
  paths: TempPaths,
  _config: VisualEvidenceConfig,
): VideoController {
  // Playwright Electron APIs don't expose context-level "record video" for the
  // ElectronApplication directly; we rely on screenshot polling as the durable
  // capture path. The controller shape stays stable so the rest of the pipeline
  // does not branch on whether video was actually active.
  return {
    async stop(): Promise<string | null> {
      try {
        const video = page.video();
        if (!video) return null;
        const p = await video.path();
        const dest = paths.video;
        if (p && p !== dest) {
          const { copyFile, rm } = await import("node:fs/promises");
          await copyFile(p, dest).catch(() => {});
          await rm(p, { force: true }).catch(() => {});
        }
        return dest;
      } catch {
        return null;
      }
    },
  };
}

export async function enableTracing(
  context: import("playwright").BrowserContext,
  paths: TempPaths,
): Promise<void> {
  try {
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  } catch {
    // Tracing may be unavailable depending on Playwright build
  }
  paths.trace;
}

export async function stopTracing(
  context: import("playwright").BrowserContext,
  paths: TempPaths,
): Promise<void> {
  try {
    await context.tracing.stop({ path: paths.trace });
  } catch {
  }
}

export function videoOutputPath(paths: TempPaths): string {
  return paths.video;
}

export function framesOutputDir(paths: TempPaths): string {
  return paths.framesDir;
}

export function joinFramePath(framesDir: string, index: number): string {
  return path.join(framesDir, `frame-${String(index).padStart(4, "0")}.png`);
}
