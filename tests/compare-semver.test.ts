import { describe, it, expect } from "vitest";
import { compareSemver } from "../src/shared/utils.js";

describe("compareSemver", () => {
  it("returns 0 for equal versions", () => {
    expect(compareSemver("2.0.0", "2.0.0")).toBe(0);
  });

  it("returns negative when a < b", () => {
    expect(compareSemver("1.9.0", "2.0.0")).toBeLessThan(0);
  });

  it("returns positive when a > b", () => {
    expect(compareSemver("3.0.0", "2.0.0")).toBeGreaterThan(0);
  });

  it("strips v prefix", () => {
    expect(compareSemver("v2.0.0", "2.0.0")).toBe(0);
  });

  it("treats missing patch as 0", () => {
    expect(compareSemver("2.0", "2.0.0")).toBe(0);
  });

  it("treats missing minor and patch as 0", () => {
    expect(compareSemver("2", "2.0.0")).toBe(0);
  });

  it("strips pre-release suffix", () => {
    expect(compareSemver("2.0.0", "2.0.0-beta.1")).toBe(0);
  });

  it("strips pre-release suffix from first argument", () => {
    expect(compareSemver("2.0.0-beta.1", "2.0.0")).toBe(0);
  });

  it("compares pre-release version below higher floor", () => {
    expect(compareSemver("2.0.0-beta.1", "3.0.0")).toBeLessThan(0);
  });

  it("compares pre-release version above lower floor", () => {
    expect(compareSemver("2.0.0-rc.3", "1.9.0")).toBeGreaterThan(0);
  });

  it("strips build metadata", () => {
    expect(compareSemver("2.0.0+build.123", "2.0.0")).toBe(0);
  });

  it("strips both pre-release and build metadata", () => {
    expect(compareSemver("2.0.0-beta.1+build.42", "2.0.0")).toBe(0);
  });

  it("treats non-numeric segments as 0", () => {
    expect(compareSemver("2.x.0", "2.0.0")).toBe(0);
  });

  it("does not return NaN for pre-release versions", () => {
    const result = compareSemver("2.0.0", "2.0.0-beta.1");
    expect(Number.isNaN(result)).toBe(false);
  });

  it("does not return NaN when compared in reverse", () => {
    const result = compareSemver("2.0.0-beta.1", "2.0.0");
    expect(Number.isNaN(result)).toBe(false);
  });

  it("compares major versions", () => {
    expect(compareSemver("3.0.0", "2.9.9")).toBeGreaterThan(0);
  });

  it("compares minor versions when major equal", () => {
    expect(compareSemver("2.1.0", "2.2.0")).toBeLessThan(0);
  });

  it("compares patch versions when major and minor equal", () => {
    expect(compareSemver("2.0.1", "2.0.2")).toBeLessThan(0);
  });
});
