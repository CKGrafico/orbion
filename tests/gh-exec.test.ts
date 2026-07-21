import { describe, it, expect } from "vitest";
import { sanitizeText, validateCliInputs, CONTROL_CHAR_RE } from "../src/main/gh-exec.js";

describe("sanitizeText", () => {
  it("strips null bytes", () => {
    expect(sanitizeText("hello\0world")).toBe("hello world");
  });

  it("strips newlines", () => {
    expect(sanitizeText("line1\nline2")).toBe("line1 line2");
  });

  it("strips tabs", () => {
    expect(sanitizeText("col1\tcol2")).toBe("col1 col2");
  });

  it("strips carriage returns", () => {
    expect(sanitizeText("line1\r\nline2")).toBe("line1  line2");
  });

  it("strips multiple control characters", () => {
    expect(sanitizeText("a\0b\tc\nd")).toBe("a b c d");
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitizeText("  hello  ")).toBe("hello");
  });

  it("returns empty string when only control characters", () => {
    expect(sanitizeText("\0\t\n\r")).toBe("");
  });

  it("preserves normal text unchanged", () => {
    expect(sanitizeText("Looks good to me!")).toBe("Looks good to me!");
  });

  it("preserves unicode content", () => {
    expect(sanitizeText("Gut gemacht! 🎉")).toBe("Gut gemacht! 🎉");
  });
});

describe("validateCliInputs", () => {
  it("passes for valid repo", () => {
    expect(() => validateCliInputs({ repo: "owner/repo" })).not.toThrow();
  });

  it("passes for undefined repo", () => {
    expect(() => validateCliInputs({ repo: undefined })).not.toThrow();
  });

  it("throws for invalid repo", () => {
    expect(() => validateCliInputs({ repo: "invalid repo" })).toThrow(/Invalid repo format/);
  });

  it("throws for body with control characters", () => {
    expect(() => validateCliInputs({ body: "review\0comment" })).toThrow(/control characters/);
  });

  it("passes for body without control characters", () => {
    expect(() => validateCliInputs({ body: "Looks good" })).not.toThrow();
  });

  it("passes for undefined body", () => {
    expect(() => validateCliInputs({ body: undefined })).not.toThrow();
  });
});

describe("CONTROL_CHAR_RE", () => {
  it("matches null byte", () => {
    expect("\0".search(CONTROL_CHAR_RE)).not.toBe(-1);
  });

  it("matches newline", () => {
    expect("\n".search(CONTROL_CHAR_RE)).not.toBe(-1);
  });

  it("matches tab", () => {
    expect("\t".search(CONTROL_CHAR_RE)).not.toBe(-1);
  });

  it("does not match normal text", () => {
    expect("hello world".search(CONTROL_CHAR_RE)).toBe(-1);
  });
});
