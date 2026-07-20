import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the ffmpeg wrapper before importing gif.ts
vi.mock("../../src/visual-evidence/capture/ffmpeg.js", () => ({
  detectFfmpeg: vi.fn(() => "/usr/bin/ffmpeg"),
  runFfmpeg: vi.fn(),
}));

import { generateGif } from "../../src/visual-evidence/capture/gif.js";
import { detectFfmpeg, runFfmpeg } from "../../src/visual-evidence/capture/ffmpeg.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DEFAULT_CONFIG } from "../../src/visual-evidence/config.js";

const mockedDetect = vi.mocked(detectFfmpeg);
const mockedRun = vi.mocked(runFfmpeg);

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ve-gif-test-"));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateGif", () => {
  it("returns null when ffmpeg is missing", async () => {
    mockedDetect.mockReturnValueOnce(null);
    const out = path.join(tmpDir(), "out.gif");
    const r = await generateGif("/nowhere.webm", out, DEFAULT_CONFIG.gif);
    expect(r).toBeNull();
  });

  it("returns null when source webm does not exist", async () => {
    const out = path.join(tmpDir(), "out.gif");
    const r = await generateGif("/nonexistent/path.webm", out, DEFAULT_CONFIG.gif);
    expect(r).toBeNull();
  });

  it("returns null when ffmpeg fails (non-zero exit)", async () => {
    const tdir = tmpDir();
    const src = path.join(tdir, "src.webm");
    const out = path.join(tdir, "out.gif");
    fs.writeFileSync(src, Buffer.from("not a real webm"));
    // Make ffmpeg throw for every invocation
    mockedRun.mockRejectedValue(new Error("ffmpeg exited with 1"));
    const r = await generateGif(src, out, DEFAULT_CONFIG.gif);
    expect(r).toBeNull();
  });

  it("returns null when output exceeds maxBytes after the ladder", async () => {
    const tdir = tmpDir();
    const src = path.join(tdir, "src.webm");
    const out = path.join(tdir, "out.gif");
    fs.writeFileSync(src, Buffer.from("stub"));
    // Simulate ffmpeg succeeding but producing an oversized GIF
    mockedRun.mockImplementation(async () => {
      // Write a fake oversized output file each call
      fs.writeFileSync(out, Buffer.alloc(5_000_000));
      return { code: 0, stdout: "", stderr: "Duration: 00:00:05.00" };
    });
    const r = await generateGif(src, out, {
      ...DEFAULT_CONFIG.gif,
      // Use a tiny limit so the ladder can never fit
      maxBytes: 100,
      targetBytes: 50,
    });
    expect(r).toBeNull();
    // Output file should be cleaned up when oversized
    expect(fs.existsSync(out)).toBe(false);
  });

  it("returns a gif result when output fits within maxBytes", async () => {
    const tdir = tmpDir();
    const src = path.join(tdir, "src.webm");
    const out = path.join(tdir, "out.gif");
    fs.writeFileSync(src, Buffer.from("stub"));
    mockedRun.mockImplementation(async () => {
      fs.writeFileSync(out, Buffer.alloc(50_000));
      return { code: 0, stdout: "", stderr: "Duration: 00:00:03.00" };
    });
    const r = await generateGif(src, out, DEFAULT_CONFIG.gif);
    expect(r).not.toBeNull();
    expect(r?.bytes).toBe(50_000);
    expect(r?.fps).toBeGreaterThan(0);
  });
});
