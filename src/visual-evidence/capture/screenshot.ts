/**
 * Capture + optimize a screenshot for visual evidence.
 *
 * Captures a Playwright page screenshot, then runs it through sharp:
 *   1. Resize to maxWidth if wider.
 *   2. Convert to the preferred format (WebP default; PNG for transparency/clarity).
 *   3. Strip metadata.
 *   4. Enforce targetBytes / maxBytes — iteratively lower quality and/or
 *      resize until within limits (or until a readability floor is reached).
 *
 * Returns the final buffer + metadata. The caller (run.ts) writes it to the
 * permanent OpenSpec evidence folder.
 */
import sharp from "sharp";
import type { VisualEvidenceConfig } from "../config.js";
import type { ImageFormat } from "../types.js";

export interface ScreenshotOptions {
  /** Override the preferred format from config */
  format?: ImageFormat;
  /** Maximum width override */
  maxWidth?: number;
  /** Element selector to capture (default: full page) */
  selector?: string;
  /** Optional caption for the resulting asset */
  caption?: string;
}

export interface OptimizedScreenshot {
  readonly buffer: Buffer;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly format: ImageFormat;
}

const MIN_QUALITY = 40;
const MIN_WIDTH = 480;

async function captureRaw(page: import("playwright").Page, opts: ScreenshotOptions): Promise<Buffer> {
  if (opts.selector) {
    const locator = page.locator(opts.selector).first();
    return locator.screenshot({ type: "png" });
  }
  return page.screenshot({ type: "png", fullPage: false });
}

async function optimize(
  raw: Buffer,
  config: VisualEvidenceConfig,
  opts: ScreenshotOptions,
): Promise<OptimizedScreenshot> {
  const format: ImageFormat = opts.format ?? config.screenshot.preferredFormat;
  const maxWidth = opts.maxWidth ?? config.screenshot.maxWidth;
  const targetBytes = config.screenshot.targetBytes;
  const maxBytes = config.screenshot.maxBytes;

  let pipeline = sharp(raw, { animated: false }).rotate();
  const meta = await pipeline.metadata();
  const origWidth = meta.width ?? maxWidth;
  const origHeight = meta.height ?? 720;

  // Initial resize if needed
  let width = origWidth > maxWidth ? maxWidth : origWidth;
  let quality = config.screenshot.quality;

  // Hard cap loop
  let attempt = 0;
  const maxAttempts = 6;
  let buffer: Buffer = Buffer.alloc(0);
  let finalW = width;
  let finalH = Math.round((origHeight * width) / origWidth);

  while (attempt < maxAttempts) {
    const resized = sharp(raw, { animated: false }).rotate().resize({ width: Math.round(width), withoutEnlargement: true });
    let encoded: Buffer;
    if (format === "webp") {
      encoded = await resized.webp({ quality, effort: 4 }).toBuffer();
    } else {
      encoded = await resized.png({ quality: Math.max(quality, 50), compressionLevel: 9, palette: true }).toBuffer();
    }
    buffer = encoded;
    finalW = Math.round(width);
    finalH = Math.round((origHeight * width) / origWidth);

    if (buffer.length <= targetBytes) break;
    if (buffer.length <= maxBytes && attempt >= 2) break;

    // Step down: reduce quality first, then width
    if (quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality - 10);
    } else if (width > MIN_WIDTH) {
      width = Math.max(MIN_WIDTH, Math.round(width * 0.85));
      quality = config.screenshot.quality; // Reset quality after a resize step
    } else {
      // Hit floor
      break;
    }
    attempt++;
  }

  // Last-resort: if still over maxBytes, do one more aggressive shrink
  if (buffer.length > maxBytes && width > MIN_WIDTH) {
    width = MIN_WIDTH;
    const resized = sharp(raw, { animated: false }).rotate().resize({ width, withoutEnlargement: true });
    buffer =
      format === "webp"
        ? await resized.webp({ quality: MIN_QUALITY, effort: 6 }).toBuffer()
        : await resized.png({ quality: MIN_QUALITY, compressionLevel: 9, palette: true }).toBuffer();
    finalW = width;
    finalH = Math.round((origHeight * width) / origWidth);
  }

  return { buffer, width: finalW, height: finalH, bytes: buffer.length, format };
}

export async function captureScreenshot(
  page: import("playwright").Page,
  config: VisualEvidenceConfig,
  opts: ScreenshotOptions = {},
): Promise<OptimizedScreenshot> {
  const raw = await page.screenshot({ type: "png", fullPage: false });
  return optimize(raw, config, opts);
}

/**
 * Save a failure screenshot to the temp dir. Not promoted to permanent
 * evidence under any circumstance.
 */
export async function captureFailureScreenshot(
  page: import("playwright").Page,
  outPath: string,
): Promise<void> {
  const buf = await page.screenshot({ type: "png" });
  const { writeFile } = await import("node:fs/promises");
  await writeFile(outPath, buf);
}
