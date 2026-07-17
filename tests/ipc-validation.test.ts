import { describe, it, expect } from "vitest";
import { isAllowedPath, validateIpc, IpcValidationError } from "../src/main/ipc-validation.js";

// ── isAllowedPath unit tests ────────────────────────────────────────────

describe("isAllowedPath", () => {
  // ── Valid paths ──────────────────────────────────────────────

  it("accepts a valid /api/ path", () => {
    expect(isAllowedPath("/api/status")).toBe(true);
  });

  it("accepts /api/ with nested segments", () => {
    expect(isAllowedPath("/api/v1/machines")).toBe(true);
  });

  it("accepts /api/ with trailing slash", () => {
    expect(isAllowedPath("/api/")).toBe(true);
  });

  it("accepts /api/ with alphanumeric and hyphens", () => {
    expect(isAllowedPath("/api/v2/machine-status")).toBe(true);
  });

  it("accepts /api/ with query-style path", () => {
    expect(isAllowedPath("/api/repos/clone")).toBe(true);
  });

  it("accepts a path at max length (512 chars)", () => {
    const longPath = "/api/" + "a".repeat(507); // 5 + 507 = 512
    expect(isAllowedPath(longPath)).toBe(true);
  });

  // ── Invalid: non-string ─────────────────────────────────────

  it("rejects non-string values", () => {
    expect(isAllowedPath(123)).toBe(false);
    expect(isAllowedPath(null)).toBe(false);
    expect(isAllowedPath(undefined)).toBe(false);
    expect(isAllowedPath({})).toBe(false);
  });

  // ── Invalid: missing /api/ prefix ───────────────────────────

  it("rejects paths not starting with /api/", () => {
    expect(isAllowedPath("/status")).toBe(false);
    expect(isAllowedPath("/admin/secrets")).toBe(false);
    expect(isAllowedPath("/")).toBe(false);
    expect(isAllowedPath("/etc/passwd")).toBe(false);
  });

  it("rejects paths starting with / but not /api/", () => {
    expect(isAllowedPath("/health")).toBe(false);
    expect(isAllowedPath("/v1/status")).toBe(false);
  });

  // ── Invalid: literal path traversal ─────────────────────────

  it("rejects literal .. path traversal", () => {
    expect(isAllowedPath("/api/../admin/secrets")).toBe(false);
    expect(isAllowedPath("/api/admin/../../etc/passwd")).toBe(false);
    expect(isAllowedPath("/api/..")).toBe(false);
  });

  // ── Invalid: URL-encoded traversal ──────────────────────────

  it("rejects URL-encoded path traversal (%2e)", () => {
    // These bypass the old ".." check because %2e%2e != ".." in raw form
    expect(isAllowedPath("/api/%2e%2e/admin/secrets")).toBe(false);
    expect(isAllowedPath("/api/%2E%2E/admin/secrets")).toBe(false);
  });

  it("rejects mixed-case URL-encoded dots", () => {
    expect(isAllowedPath("/api/%2e%2E/admin")).toBe(false);
    expect(isAllowedPath("/api/%2E%2e/admin")).toBe(false);
  });

  // ── Invalid: double-encoded traversal ───────────────────────

  it("rejects double-encoded path traversal (%252e)", () => {
    expect(isAllowedPath("/api/..%252f..%252f/admin")).toBe(false);
    expect(isAllowedPath("/api/%252e%252e/admin")).toBe(false);
  });

  it("rejects any %25 (double-encoding indicator)", () => {
    expect(isAllowedPath("/api/%25")).toBe(false);
    expect(isAllowedPath("/api/test%25foo")).toBe(false);
  });

  // ── Invalid: encoded dots in raw form ───────────────────────

  it("rejects any %2e in raw path (encoded dot)", () => {
    expect(isAllowedPath("/api/admin%2esecrets")).toBe(false);
  });

  // ── Invalid: malformed encoding ─────────────────────────────

  it("rejects malformed percent encoding", () => {
    expect(isAllowedPath("/api/test%ZZ")).toBe(false);
    expect(isAllowedPath("/api/%")).toBe(false);
  });

  // ── Invalid: path length ─────────────────────────────────────

  it("rejects paths exceeding 512 characters", () => {
    const tooLong = "/api/" + "a".repeat(508); // 5 + 508 = 513
    expect(isAllowedPath(tooLong)).toBe(false);
  });

  // ── Edge cases ───────────────────────────────────────────────

  it("rejects empty string", () => {
    expect(isAllowedPath("")).toBe(false);
  });

  it("rejects relative path without leading slash", () => {
    expect(isAllowedPath("api/status")).toBe(false);
  });
});

// ── Integration: validateIpc uses isAllowedPath ─────────────────────────

describe("validateIpc api:request path validation", () => {
  const validArgs = () => [{
    baseUrl: "https://example.com",
    path: "/api/status",
    method: "GET",
  }];

  it("accepts valid api:request with good path", () => {
    expect(() => validateIpc("api:request", validArgs())).not.toThrow();
  });

  it("rejects api:request with traversal path", () => {
    const args = [{ ...validArgs()[0], path: "/api/../admin" }];
    expect(() => validateIpc("api:request", args)).toThrow(IpcValidationError);
  });

  it("rejects api:request with URL-encoded traversal", () => {
    const args = [{ ...validArgs()[0], path: "/api/%2e%2e/admin" }];
    expect(() => validateIpc("api:request", args)).toThrow(IpcValidationError);
  });

  it("rejects api:request with non-/api/ path", () => {
    const args = [{ ...validArgs()[0], path: "/admin/secrets" }];
    expect(() => validateIpc("api:request", args)).toThrow(IpcValidationError);
  });

  it("rejects api:request with double-encoded traversal", () => {
    const args = [{ ...validArgs()[0], path: "/api/%252e%252e/admin" }];
    expect(() => validateIpc("api:request", args)).toThrow(IpcValidationError);
  });
});

describe("validateIpc stream:subscribe path validation", () => {
  const validArgs = () => [{
    subId: "sub-123",
    baseUrl: "https://example.com",
    path: "/api/events",
  }];

  it("accepts valid stream:subscribe with good path", () => {
    expect(() => validateIpc("stream:subscribe", validArgs())).not.toThrow();
  });

  it("rejects stream:subscribe with traversal path", () => {
    const args = [{ ...validArgs()[0], path: "/api/../admin" }];
    expect(() => validateIpc("stream:subscribe", args)).toThrow(IpcValidationError);
  });

  it("rejects stream:subscribe with URL-encoded traversal", () => {
    const args = [{ ...validArgs()[0], path: "/api/%2e%2e/admin" }];
    expect(() => validateIpc("stream:subscribe", args)).toThrow(IpcValidationError);
  });
});
