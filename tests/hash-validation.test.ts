import { describe, it, expect } from "vitest";
import { validateHash, hashForHost } from "../src/main/ssh-launch.js";
import type { SshHost } from "../src/shared/ipc.js";

function makeHost(overrides: Record<string, string | number | undefined> = {}): SshHost {
  return {
    host: "example.com",
    hostName: "example.com",
    user: "root",
    port: 22,
    label: "root@example.com",
    ...overrides,
  };
}

describe("validateHash", () => {
  // ── Valid hashes ─────────────────────────────────────────────

  it("accepts a valid 12-char hex hash", () => {
    expect(() => validateHash("a1b2c3d4e5f6")).not.toThrow();
  });

  it("accepts a valid short hex hash", () => {
    expect(() => validateHash("abc123")).not.toThrow();
  });

  it("accepts a single hex char", () => {
    expect(() => validateHash("0")).not.toThrow();
  });

  it("accepts all-zero hash", () => {
    expect(() => validateHash("000000000000")).not.toThrow();
  });

  // ── Invalid hashes — injection vectors ───────────────────────

  it("rejects hash with shell command substitution", () => {
    expect(() => validateHash("$(rm -rf /)")).toThrow();
  });

  it("rejects hash with backtick command substitution", () => {
    expect(() => validateHash("`id`")).toThrow();
  });

  it("rejects hash with semicolons (command chaining)", () => {
    expect(() => validateHash("abc;rm -rf")).toThrow();
  });

  it("rejects hash with pipe (command piping)", () => {
    expect(() => validateHash("abc|evil")).toThrow();
  });

  it("rejects hash with_ampersand (background execution)", () => {
    expect(() => validateHash("abc&&evil")).toThrow();
  });

  it("rejects hash with spaces", () => {
    expect(() => validateHash("abc def")).toThrow();
  });

  it("rejects hash with newlines", () => {
    expect(() => validateHash("abc\nevil")).toThrow();
  });

  it("rejects empty hash", () => {
    expect(() => validateHash("")).toThrow();
  });

  it("rejects hash longer than 12 chars", () => {
    expect(() => validateHash("a1b2c3d4e5f6a1")).toThrow();
  });

  it("rejects hash with uppercase hex (only lowercase allowed)", () => {
    expect(() => validateHash("A1B2C3D4E5F6")).toThrow();
  });

  it("rejects hash with special characters", () => {
    expect(() => validateHash("abc!@#$%")).toThrow();
  });

  it("rejects hash with forward slashes (path traversal attempt)", () => {
    expect(() => validateHash("abc/../../etc")).toThrow();
  });

  it("rejects hash starting with dash (flag injection)", () => {
    expect(() => validateHash("-abc123")).toThrow();
  });
});

describe("hashForHost", () => {
  it("produces a 12-char lowercase hex string", () => {
    const hash = hashForHost(makeHost());
    expect(hash).toHaveLength(12);
    expect(/^[a-f0-9]{12}$/.test(hash)).toBe(true);
  });

  it("produces consistent hashes for the same host", () => {
    const h1 = hashForHost(makeHost());
    const h2 = hashForHost(makeHost());
    expect(h1).toBe(h2);
  });

  it("produces different hashes for different hosts", () => {
    const h1 = hashForHost(makeHost());
    const h2 = hashForHost(makeHost({ hostName: "other.com", host: "other.com" }));
    expect(h1).not.toBe(h2);
  });

  it("produces output that passes validateHash", () => {
    const hash = hashForHost(makeHost());
    expect(() => validateHash(hash)).not.toThrow();
  });
});
