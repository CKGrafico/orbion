/**
 * Visual-evidence configuration.
 *
 * Defaults are tuned for the Orbion Electron app (1280×720 window, WebP
 * screenshots, 10fps GIFs). A repo-level override file at
 * `.orbion/visual-evidence.json` is deep-merged over the defaults when
 * present. Environment variables prefixed `ORBION_VISUAL_EVIDENCE_*`
 * override individual scalar fields for CI.
 */
import fs from "node:fs";
import path from "node:path";

// ── Public config shape ────────────────────────────────────────────────

export interface ScreenshotConfig {
  /** "webp" preferred; "png" when transparency or pixel-perfect clarity is required */
  preferredFormat: "webp" | "png";
  /** WebP quality 1-100 (ignored for PNG) */
  quality: number;
  /** Maximum pixel width; larger captures are downscaled */
  maxWidth: number;
  /** Soft target — try to get under this; not a hard cap */
  targetBytes: number;
  /** Hard cap — never commit a screenshot larger than this */
  maxBytes: number;
}

export interface GifConfig {
  enabled: boolean;
  maxWidth: number;
  fps: number;
  targetBytes: number;
  maxBytes: number;
  /** Trim the recording to at most this many seconds */
  maxDurationSeconds: number;
}

export interface WindowConfig {
  width: number;
  height: number;
}

export interface VisualEvidenceConfig {
  window: WindowConfig;
  screenshot: ScreenshotConfig;
  gif: GifConfig;
  /** Where raw PNG / webm / traces / frames live — gitignored, never committed */
  temporaryDirectory: string;
  /** Name of the permanent evidence subfolder inside the OpenSpec change */
  evidenceDirectoryName: string;
}

// ── Defaults ───────────────────────────────────────────────────────────

export const DEFAULT_CONFIG: VisualEvidenceConfig = {
  window: {
    width: 1280,
    height: 720,
  },
  screenshot: {
    preferredFormat: "webp",
    quality: 82,
    maxWidth: 1280,
    targetBytes: 153_600, // 150 KB
    maxBytes: 307_200, // 300 KB
  },
  gif: {
    enabled: true,
    maxWidth: 960,
    fps: 10,
    targetBytes: 1_048_576, // 1 MB
    maxBytes: 2_097_152, // 2 MB
    maxDurationSeconds: 10,
  },
  temporaryDirectory: ".tmp/visual-evidence",
  evidenceDirectoryName: "evidence",
};

// ── Loader ─────────────────────────────────────────────────────────────

const CONFIG_FILE_CANDIDATES = [
  ".orbion/visual-evidence.json",
  "visual-evidence.config.json",
];

function readRepoConfig(repoRoot: string): Partial<VisualEvidenceConfig> | null {
  for (const rel of CONFIG_FILE_CANDIDATES) {
    const abs = path.join(repoRoot, rel);
    if (fs.existsSync(abs)) {
      try {
        const raw = fs.readFileSync(abs, "utf8");
        return JSON.parse(raw) as Partial<VisualEvidenceConfig>;
      } catch {
        // Malformed config file — ignore it and fall through to env + defaults
        return null;
      }
    }
  }
  return null;
}

function applyEnvOverrides(cfg: VisualEvidenceConfig): VisualEvidenceConfig {
  const env = process.env;
  const next: VisualEvidenceConfig = structuredClone(cfg);

  const w = env["ORBION_VISUAL_EVIDENCE_WINDOW_WIDTH"];
  const h = env["ORBION_VISUAL_EVIDENCE_WINDOW_HEIGHT"];
  if (w) next.window.width = Number(w) || next.window.width;
  if (h) next.window.height = Number(h) || next.window.height;

  const sFmt = env["ORBION_VISUAL_EVIDENCE_SCREENSHOT_FORMAT"];
  if (sFmt === "webp" || sFmt === "png") next.screenshot.preferredFormat = sFmt;
  const sQ = env["ORBION_VISUAL_EVIDENCE_SCREENSHOT_QUALITY"];
  if (sQ) next.screenshot.quality = Number(sQ) || next.screenshot.quality;
  const sMw = env["ORBION_VISUAL_EVIDENCE_SCREENSHOT_MAX_WIDTH"];
  if (sMw) next.screenshot.maxWidth = Number(sMw) || next.screenshot.maxWidth;
  const sTarget = env["ORBION_VISUAL_EVIDENCE_SCREENSHOT_TARGET_BYTES"];
  if (sTarget) next.screenshot.targetBytes = Number(sTarget) || next.screenshot.targetBytes;
  const sMax = env["ORBION_VISUAL_EVIDENCE_SCREENSHOT_MAX_BYTES"];
  if (sMax) next.screenshot.maxBytes = Number(sMax) || next.screenshot.maxBytes;

  const gEnabled = env["ORBION_VISUAL_EVIDENCE_GIF_ENABLED"];
  if (gEnabled === "false" || gEnabled === "0") next.gif.enabled = false;
  if (gEnabled === "true" || gEnabled === "1") next.gif.enabled = true;
  const gMw = env["ORBION_VISUAL_EVIDENCE_GIF_MAX_WIDTH"];
  if (gMw) next.gif.maxWidth = Number(gMw) || next.gif.maxWidth;
  const gFps = env["ORBION_VISUAL_EVIDENCE_GIF_FPS"];
  if (gFps) next.gif.fps = Number(gFps) || next.gif.fps;
  const gTarget = env["ORBION_VISUAL_EVIDENCE_GIF_TARGET_BYTES"];
  if (gTarget) next.gif.targetBytes = Number(gTarget) || next.gif.targetBytes;
  const gMax = env["ORBION_VISUAL_EVIDENCE_GIF_MAX_BYTES"];
  if (gMax) next.gif.maxBytes = Number(gMax) || next.gif.maxBytes;
  const gDur = env["ORBION_VISUAL_EVIDENCE_GIF_MAX_DURATION"];
  if (gDur) next.gif.maxDurationSeconds = Number(gDur) || next.gif.maxDurationSeconds;

  const tmp = env["ORBION_VISUAL_EVIDENCE_TMP_DIR"];
  if (tmp) next.temporaryDirectory = tmp;

  const evDir = env["ORBION_VISUAL_EVIDENCE_EVIDENCE_DIR"];
  if (evDir) next.evidenceDirectoryName = evDir;

  return next;
}

function deepMerge<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
  const out: Record<string, unknown> = structuredClone(base as Record<string, unknown>);
  for (const [k, v] of Object.entries(override ?? {})) {
    if (v === null || v === undefined) continue;
    const baseVal = out[k];
    if (
      baseVal !== null &&
      typeof baseVal === "object" &&
      !Array.isArray(baseVal) &&
      typeof v === "object" &&
      !Array.isArray(v)
    ) {
      out[k] = deepMerge(baseVal as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

export function loadConfig(repoRoot: string): VisualEvidenceConfig {
  let cfg: VisualEvidenceConfig = structuredClone(DEFAULT_CONFIG);
  const override = readRepoConfig(repoRoot);
  if (override) {
    cfg = deepMerge(cfg, override);
  }
  return applyEnvOverrides(cfg);
}

export function resolveConfig(): VisualEvidenceConfig {
  const repoRoot = findRepoRoot();
  return loadConfig(repoRoot);
}

export function findRepoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (fs.existsSync(path.join(dir, "openspec"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}
