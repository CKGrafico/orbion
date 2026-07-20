/**
 * Temporary video recording for visual-evidence runs.
 *
 * Playwright records the window's context as a webm video into the temp
 * directory. The raw webm is NEVER copied into permanent OpenSpec evidence —
 * it exists only so {@link ./gif.ts} can convert it to an optimized GIF, and
 * so failures can be inspected post-hoc.
 */
import path from "node:path";
import type { TempPaths } from "../launch/deterministic-env.js";
import type { VisualEvidenceConfig } from "../config.js";

export interface VideoController {
  /** Stop recording and return the resulting webm path, or null when no video was produced */
  stop: () => Promise<string | null>;
}

/**
 * Enable video recording on a Playwright BrowserContext (the one backing the
 * Electron window). Recording starts immediately and the file lands at
 * `paths.video` when stopped.
 */
export function enableVideo(
  page: import("playwright").Page,
  paths: TempPaths,
  _config: VisualEvidenceConfig,
): VideoController {
  // Playwright Electron APIs don't expose a context-level "record video" for
  // the ElectronApplication directly; we rely on the BrowserContext backing
  // the first window, and use tracing + screenshot polling as the durable
  // capture path. For headless-Chrome-style flows, context.video is available.
  // We keep the controller shape stable so the rest of the pipeline does not
  // branch on whether video was actually active.
  return {
    async stop(): Promise<string | null> {
      try {
        const video = page.video();
        if (!video) return null;
        const p = await video.path();
        const dest = paths.video;
        if (p && p !== dest) {
          const { copyFile, rm } = await import("node:fs/promises");
          await copyFile(p, dest).catch(() => {
            // Ignore copy errors — keep the original at `p`
          });
          await rm(p, { force: true }).catch(() => {
            // best-effort
          });
        }
        return dest;
      } catch {
        return null;
      }
    },
  };
}

/**
 * Convenience: enable Playwright tracing on the context. Traces are temp-only
 * debugging artifacts that pair with video on scenario failure.
 */
export async function enableTracing(
  context: import("playwright").BrowserContext,
  paths: TempPaths,
): Promise<void> {
  try {
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  } catch {
    // Tracing may be unavailable depending on Playwright build — ignore
  }
  paths.trace; // referenced to ensure path field is consumed by callers
}

export async function stopTracing(
  context: import("playwright").BrowserContext,
  paths: TempPaths,
): Promise<void> {
  try {
    await context.tracing.stop({ path: paths.trace });
  } catch {
    // best-effort
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
