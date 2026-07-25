/**
 * ffmpeg two-pass palette workflow for GIFs. Size enforcement ladder:
 * reduce width → reduce fps → trim duration. Returns null when the GIF
 * cannot fit within config.gif.maxBytes — the caller falls back to
 * screenshot-only evidence and never commits an oversized GIF.
 */
import fs from "node:fs";
import path from "node:path";
import type { GifConfig } from "../config.js";
import type { GifAsset } from "../types.js";
import { detectFfmpeg, runFfmpeg } from "./ffmpeg.js";

export interface GifResult {
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly durationSeconds: number;
  readonly bytes: number;
}

export interface GifOptions {
  maxDurationSeconds?: number;
  crop?: [number, number, number, number];
}

const WIDTH_LADDER = [960, 720, 540, 400] as const;
const FPS_LADDER = [10, 8, 6] as const;
const READABILITY_FLOOR_WIDTH = 400;

function fileSize(p: string): number {
  try {
    return fs.statSync(p).size;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

async function probeDuration(webmPath: string): Promise<number> {
  // ffprobe not available; parse duration from ffmpeg -i stderr
  try {
    const r = await runFfmpeg(["-i", webmPath], { timeoutMs: 15_000 });
    const m = r.stderr.match(/Duration:\s+(\d+):(\d+):(\d+\.\d+)/);
    if (m) {
      const [, hh, mm, ss] = m;
      return Number(hh) * 3600 + Number(mm) * 60 + Number(ss);
    }
  } catch {
    // ignore
  }
  return 0;
}

async function convert(
  webmPath: string,
  outPath: string,
  width: number,
  fps: number,
  durationCap: number,
  crop?: [number, number, number, number],
): Promise<void> {
  const palettePath = path.join(path.dirname(outPath), "palette.png");

  const filterParts: string[] = [];
  if (crop) filterParts.push(`crop=${crop[2]}:${crop[3]}:${crop[0]}:${crop[1]}`);
  filterParts.push(`scale=${width}:-1:flags=lanczos`);
  filterParts.push(`fps=${fps}`);

  const trim = durationCap > 0 ? ["-t", String(durationCap)] : [];
  const vf = filterParts.join(",");

  // Pass 1: palette
  const paletteFilter = `${vf},palettegen=stats_mode=diff`;
  await runFfmpeg(["-y", ...trim, "-i", webmPath, "-vf", paletteFilter, palettePath], {
    timeoutMs: 60_000,
  });

  // Pass 2: gif
  const gifFilter = `${vf}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;
  await runFfmpeg(
    ["-y", ...trim, "-i", webmPath, "-i", palettePath, "-filter_complex", gifFilter, outPath],
    { timeoutMs: 90_000 },
  );

  // Best-effort cleanup
  try {
    fs.unlinkSync(palettePath);
  } catch {
    // ignore
  }
}

export async function generateGif(
  webmPath: string,
  outPath: string,
  config: GifConfig,
  opts: GifOptions = {},
): Promise<GifResult | null> {
  const ffmpeg = detectFfmpeg();
  if (!ffmpeg) {
    return null;
  }
  if (!fs.existsSync(webmPath)) {
    return null;
  }

  const maxDuration = opts.maxDurationSeconds ?? config.maxDurationSeconds;
  const totalDuration = await probeDuration(webmPath);
  const durationCap = Math.min(maxDuration, totalDuration > 0 ? totalDuration : maxDuration);

  for (const width of WIDTH_LADDER) {
    if (width > config.maxWidth) continue;
    for (const fps of FPS_LADDER) {
      if (fps > config.fps) continue;
      try {
        await convert(webmPath, outPath, width, fps, durationCap, opts.crop);
      } catch {
        continue;
      }
      const bytes = fileSize(outPath);
      if (bytes <= config.maxBytes) {
        const height = Math.round((width * 9) / 16);
        return {
          path: outPath,
          width,
          height: height > 0 ? height : 540,
          fps,
          durationSeconds: durationCap,
          bytes,
        };
      }
    }
  }

  if (config.maxWidth >= READABILITY_FLOOR_WIDTH) {
    try {
      await convert(webmPath, outPath, READABILITY_FLOOR_WIDTH, 6, durationCap, opts.crop);
      const bytes = fileSize(outPath);
      if (bytes <= config.maxBytes) {
        return {
          path: outPath,
          width: READABILITY_FLOOR_WIDTH,
          height: 300,
          fps: 6,
          durationSeconds: durationCap,
          bytes,
        };
      }
    } catch {
      // fall through to cleanup
    }
  }

  if (fs.existsSync(outPath)) {
    try {
      fs.unlinkSync(outPath);
    } catch {
      // ignore
    }
  }
  return null;
}

export function gifAssetFromResult(r: GifResult, caption: string, evidenceRelPath: string): GifAsset {
  return {
    type: "gif",
    path: evidenceRelPath,
    caption,
    width: r.width,
    height: r.height,
    fps: r.fps,
    durationSeconds: r.durationSeconds,
    bytes: r.bytes,
    format: "gif",
  };
}
