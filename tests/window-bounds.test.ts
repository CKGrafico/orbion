import { describe, it, expect } from "vitest";
import { validateBounds } from "../src/main/window-bounds.js";

describe("validateBounds", () => {
  it("returns defaults for null input", () => {
    expect(validateBounds(null)).toBeNull();
  });

  it("returns defaults for non-object input", () => {
    expect(validateBounds("string")).toBeNull();
    expect(validateBounds(42)).toBeNull();
  });

  it("returns defaults when width is missing", () => {
    expect(validateBounds({ height: 900 })).toBeNull();
  });

  it("returns defaults when height is missing", () => {
    expect(validateBounds({ width: 1440 })).toBeNull();
  });

  it("returns defaults when width is not a number", () => {
    expect(validateBounds({ width: "1440", height: 900 })).toBeNull();
  });

  it("returns defaults when height is not a number", () => {
    expect(validateBounds({ width: 1440, height: "900" })).toBeNull();
  });

  it("returns defaults when width is zero", () => {
    expect(validateBounds({ width: 0, height: 900 })).toBeNull();
  });

  it("returns defaults when width is negative", () => {
    expect(validateBounds({ width: -100, height: 900 })).toBeNull();
  });

  it("returns defaults when width exceeds max", () => {
    expect(validateBounds({ width: 8000, height: 900 })).toBeNull();
  });

  it("returns defaults when height is zero", () => {
    expect(validateBounds({ width: 1440, height: 0 })).toBeNull();
  });

  it("returns defaults when height exceeds max", () => {
    expect(validateBounds({ width: 1440, height: 5000 })).toBeNull();
  });

  it("returns valid bounds with width and height only", () => {
    expect(validateBounds({ width: 1440, height: 900 })).toEqual({
      width: 1440,
      height: 900,
    });
  });

  it("preserves valid x coordinate", () => {
    expect(validateBounds({ width: 1440, height: 900, x: 100 })).toEqual({
      width: 1440,
      height: 900,
      x: 100,
    });
  });

  it("preserves valid y coordinate", () => {
    expect(validateBounds({ width: 1440, height: 900, y: 200 })).toEqual({
      width: 1440,
      height: 900,
      y: 200,
    });
  });

  it("strips x when below minimum", () => {
    const result = validateBounds({ width: 1440, height: 900, x: -2000 });
    expect(result).toEqual({ width: 1440, height: 900 });
    expect(result?.x).toBeUndefined();
  });

  it("strips x when above maximum", () => {
    const result = validateBounds({ width: 1440, height: 900, x: 20000 });
    expect(result).toEqual({ width: 1440, height: 900 });
    expect(result?.x).toBeUndefined();
  });

  it("strips y when below minimum", () => {
    const result = validateBounds({ width: 1440, height: 900, y: -2000 });
    expect(result).toEqual({ width: 1440, height: 900 });
    expect(result?.y).toBeUndefined();
  });

  it("strips y when above maximum", () => {
    const result = validateBounds({ width: 1440, height: 900, y: 20000 });
    expect(result).toEqual({ width: 1440, height: 900 });
    expect(result?.y).toBeUndefined();
  });

  it("preserves x at boundary minimum (-1000)", () => {
    expect(validateBounds({ width: 1440, height: 900, x: -1000 })).toEqual({
      width: 1440,
      height: 900,
      x: -1000,
    });
  });

  it("preserves x at boundary maximum (10000)", () => {
    expect(validateBounds({ width: 1440, height: 900, x: 10000 })).toEqual({
      width: 1440,
      height: 900,
      x: 10000,
    });
  });

  it("ignores non-number x without stripping", () => {
    const result = validateBounds({ width: 1440, height: 900, x: "bad" });
    expect(result).toEqual({ width: 1440, height: 900 });
    expect(result?.x).toBeUndefined();
  });

  it("ignores null x without error", () => {
    const result = validateBounds({ width: 1440, height: 900, x: null });
    expect(result).toEqual({ width: 1440, height: 900 });
  });

  it("preserves maximized flag when boolean", () => {
    expect(validateBounds({ width: 1440, height: 900, maximized: true })).toEqual({
      width: 1440,
      height: 900,
      maximized: true,
    });
  });

  it("omits maximized when not boolean", () => {
    const result = validateBounds({ width: 1440, height: 900, maximized: "yes" });
    expect(result?.maximized).toBeUndefined();
  });

  it("handles full valid bounds", () => {
    expect(
      validateBounds({ width: 1920, height: 1080, x: 50, y: 50, maximized: false }),
    ).toEqual({ width: 1920, height: 1080, x: 50, y: 50, maximized: false });
  });

  it("strips off-screen x and y while keeping valid width/height", () => {
    const result = validateBounds({ width: 1440, height: 900, x: 99999, y: -99999 });
    expect(result).toEqual({ width: 1440, height: 900 });
  });

  it("accepts width at max boundary (7680)", () => {
    expect(validateBounds({ width: 7680, height: 4320 })).toEqual({
      width: 7680,
      height: 4320,
    });
  });

  it("accepts small but positive dimensions", () => {
    expect(validateBounds({ width: 1, height: 1 })).toEqual({ width: 1, height: 1 });
  });
});
