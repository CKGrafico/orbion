/**
 * Pure size-limit checks for evidence assets.
 * No I/O — operates over in-memory candidates and configured limits.
 */
import type {
  CaptureCandidate,
  EvidenceAsset,
  ScreenshotAsset,
  GifAsset,
} from "./types.js";
import type { VisualEvidenceConfig } from "./config.js";

export interface SizeVerdict {
  readonly ok: boolean;
  readonly reason?: string;
}

export function enforceScreenshot(candidate: { bytes: number }, config: VisualEvidenceConfig): SizeVerdict {
  const limit = config.screenshot.maxBytes;
  if (candidate.bytes > limit) {
    return { ok: false, reason: `screenshot ${candidate.bytes}B exceeds max ${limit}B` };
  }
  return { ok: true };
}

export function enforceGif(candidate: { bytes: number }, config: VisualEvidenceConfig): SizeVerdict {
  const limit = config.gif.maxBytes;
  if (candidate.bytes > limit) {
    return { ok: false, reason: `gif ${candidate.bytes}B exceeds max ${limit}B` };
  }
  return { ok: true };
}

export function enforceSizeLimits(
  candidate: { bytes: number; type: "screenshot" | "gif" | "video" },
  config: VisualEvidenceConfig,
): SizeVerdict {
  if (candidate.type === "screenshot") return enforceScreenshot(candidate, config);
  if (candidate.type === "gif") return enforceGif(candidate, config);
  // Videos are never promoted to permanent evidence
  return {
    ok: false,
    reason: "videos are temporary artifacts and must not be committed to permanent evidence",
  };
}

export interface FinalAssetsSelection {
  readonly screenshot: EvidenceAsset | null;
  readonly gif: EvidenceAsset | null;
  readonly droppedGif: boolean;
  readonly reasons: readonly string[];
}

const SCREENSHOT_REL_PATH = "evidence/final.webp";
const GIF_REL_PATH = "evidence/flow.gif";

function buildScreenshotAsset(
  c: CaptureCandidate,
  relPath: string,
): ScreenshotAsset {
  return {
    type: "screenshot",
    path: relPath,
    caption: c.caption,
    width: c.width,
    height: c.height,
    bytes: c.bytes,
    format: c.format as "webp" | "png",
  };
}

function buildGifAsset(c: CaptureCandidate, relPath: string): GifAsset {
  return {
    type: "gif",
    path: relPath,
    caption: c.caption,
    width: c.width,
    height: c.height,
    fps: c.fps ?? 10,
    durationSeconds: c.durationSeconds ?? 0,
    bytes: c.bytes,
    format: "gif",
  };
}

/**
 * Pick final assets. Screenshot always kept (when below maxBytes);
 * GIF only kept when below gif.maxBytes, otherwise dropped.
 */
export function chooseFinalAssets(
  candidates: readonly CaptureCandidate[],
  config: VisualEvidenceConfig,
  screenshotRelPath: string = SCREENSHOT_REL_PATH,
  gifRelPath: string = GIF_REL_PATH,
): FinalAssetsSelection {
  const reasons: string[] = [];
  let screenshot: ScreenshotAsset | null = null;
  let gif: GifAsset | null = null;
  let droppedGif = false;

  for (const c of candidates) {
    const verdict = enforceSizeLimits(
      { bytes: c.bytes, type: c.type },
      config,
    );
    if (!verdict.ok) {
      if (c.type === "gif") {
        droppedGif = true;
        reasons.push(verdict.reason ?? "gif too large");
      } else if (c.type === "video") {
        reasons.push(verdict.reason ?? "video not allowed");
      } else if (!screenshot) {
        // Record the reason even if no screenshot at all
        reasons.push(verdict.reason ?? "screenshot too large");
      }
      continue;
    }
    if (c.type === "screenshot" && !screenshot) {
      screenshot = buildScreenshotAsset(c, screenshotRelPath);
    } else if (c.type === "gif" && !gif) {
      gif = buildGifAsset(c, gifRelPath);
    }
  }

  return { screenshot, gif, droppedGif, reasons };
}
