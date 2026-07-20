import { describe, it, expect } from "vitest";
import {
  enforceScreenshot,
  enforceGif,
  enforceSizeLimits,
  chooseFinalAssets,
} from "../../src/visual-evidence/size-limits.js";
import { DEFAULT_CONFIG } from "../../src/visual-evidence/config.js";
import type { CaptureCandidate } from "../../src/visual-evidence/types.js";

describe("enforceScreenshot", () => {
  it("passes when under maxBytes", () => {
    const v = enforceScreenshot({ bytes: 100_000 }, DEFAULT_CONFIG);
    expect(v.ok).toBe(true);
  });

  it("rejects when over maxBytes", () => {
    const v = enforceScreenshot({ bytes: 500_000 }, DEFAULT_CONFIG);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/screenshot/);
  });
});

describe("enforceGif", () => {
  it("passes when under maxBytes", () => {
    const v = enforceGif({ bytes: 500_000 }, DEFAULT_CONFIG);
    expect(v.ok).toBe(true);
  });

  it("rejects when over maxBytes", () => {
    const v = enforceGif({ bytes: 5_000_000 }, DEFAULT_CONFIG);
    expect(v.ok).toBe(false);
  });
});

describe("enforceSizeLimits", () => {
  it("rejects videos unconditionally", () => {
    const v = enforceSizeLimits({ bytes: 10, type: "video" }, DEFAULT_CONFIG);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/temporary|video/);
  });
});

function candidate(type: "screenshot" | "gif", bytes: number, opts: Partial<CaptureCandidate> = {}): CaptureCandidate {
  return {
    type,
    buffer: Buffer.alloc(0),
    width: 100, height: 100,
    bytes, format: type === "screenshot" ? "webp" : "gif",
    caption: "test",
    ...opts,
  };
}

describe("chooseFinalAssets", () => {
  it("keeps the screenshot within limits", () => {
    const sel = chooseFinalAssets([candidate("screenshot", 100_000)], DEFAULT_CONFIG);
    expect(sel.screenshot).not.toBeNull();
    expect(sel.gif).toBeNull();
    expect(sel.droppedGif).toBe(false);
  });

  it("drops oversized gif and keeps screenshot only", () => {
    const sel = chooseFinalAssets(
      [candidate("screenshot", 100_000), candidate("gif", 5_000_000)],
      DEFAULT_CONFIG,
    );
    expect(sel.screenshot).not.toBeNull();
    expect(sel.gif).toBeNull();
    expect(sel.droppedGif).toBe(true);
  });

  it("keeps both when within limits", () => {
    const sel = chooseFinalAssets(
      [candidate("screenshot", 100_000), candidate("gif", 1_000_000)],
      DEFAULT_CONFIG,
    );
    expect(sel.screenshot).not.toBeNull();
    expect(sel.gif).not.toBeNull();
    expect(sel.droppedGif).toBe(false);
  });

  it("reports reasons when assets are dropped", () => {
    const sel = chooseFinalAssets(
      [candidate("screenshot", 500_000), candidate("gif", 5_000_000)],
      DEFAULT_CONFIG,
    );
    expect(sel.reasons.length).toBeGreaterThan(0);
    expect(sel.screenshot).toBeNull();
    expect(sel.gif).toBeNull();
  });

  it("reports final bytes in returned assets", () => {
    const sel = chooseFinalAssets(
      [candidate("screenshot", 120_000), candidate("gif", 800_000)],
      DEFAULT_CONFIG,
    );
    expect(sel.screenshot?.bytes).toBe(120_000);
    expect(sel.gif?.bytes).toBe(800_000);
  });
});
