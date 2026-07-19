/**
 * Integration tests for allowlist enforcement in the IPC validation layer.
 *
 * ipc-validation.ts imports `electron` at the top level, which is not available
 * in a plain Vitest run. We mock it so we can test the allowlist enforcement
 * without a full Electron environment.
 */
import { describe, it, expect, vi } from "vitest";

// Mock electron before importing the module under test
vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
}));

import { validateIpc, IpcValidationError, isAllowedPath } from "../ipc-validation";

// ── isAllowedPath (existing tests preserved) ──────────────────────────

describe("isAllowedPath", () => {
  it("accepts /api/loops", () => {
    expect(isAllowedPath("/api/loops")).toBe(true);
  });
  it("accepts /api/loops/abc-123", () => {
    expect(isAllowedPath("/api/loops/abc-123")).toBe(true);
  });
  it("rejects paths not starting with /api/", () => {
    expect(isAllowedPath("/admin/secret")).toBe(false);
  });
  it("rejects path traversal", () => {
    expect(isAllowedPath("/api/../etc/passwd")).toBe(false);
  });
  it("rejects encoded path traversal", () => {
    expect(isAllowedPath("/api/%2e%2e/etc/passwd")).toBe(false);
  });
  it("rejects double-encoded sequences", () => {
    expect(isAllowedPath("/api/%252e%252e/etc/passwd")).toBe(false);
  });
});

// ── api:request allowlist enforcement ─────────────────────────────────

describe("api:request — allowlist enforcement", () => {
  const validBaseUrl = "http://localhost:13284";

  it("allows GET /api/loops (allowlisted)", () => {
    expect(() =>
      validateIpc("api:request", [{ baseUrl: validBaseUrl, path: "/api/loops", method: "GET" }]),
    ).not.toThrow();
  });

  it("allows POST /api/loops/{id}/pause (allowlisted)", () => {
    expect(() =>
      validateIpc("api:request", [{ baseUrl: validBaseUrl, path: "/api/loops/abc-123/pause", method: "POST" }]),
    ).not.toThrow();
  });

  it("allows GET /api/loops/{id}/logs?tail=50 (allowlisted with query)", () => {
    expect(() =>
      validateIpc("api:request", [{ baseUrl: validBaseUrl, path: "/api/loops/abc-123/logs?tail=50", method: "GET" }]),
    ).not.toThrow();
  });

  it("rejects DELETE /api/loops/{id} (not allowlisted)", () => {
    expect(() =>
      validateIpc("api:request", [{ baseUrl: validBaseUrl, path: "/api/loops/abc-123", method: "DELETE" }]),
    ).toThrow(IpcValidationError);
  });

  it("rejects POST /api/settings (not allowlisted)", () => {
    expect(() =>
      validateIpc("api:request", [{ baseUrl: validBaseUrl, path: "/api/settings", method: "POST" }]),
    ).toThrow(IpcValidationError);
  });

  it("rejects PATCH /api/loops/{id} (not allowlisted)", () => {
    expect(() =>
      validateIpc("api:request", [{ baseUrl: validBaseUrl, path: "/api/loops/abc-123", method: "PATCH" }]),
    ).toThrow(IpcValidationError);
  });

  it("rejects POST /api/loops (not allowlisted — no create-from-renderer)", () => {
    expect(() =>
      validateIpc("api:request", [{ baseUrl: validBaseUrl, path: "/api/loops", method: "POST" }]),
    ).toThrow(IpcValidationError);
  });

  it("rejects GET /api/admin (not allowlisted)", () => {
    expect(() =>
      validateIpc("api:request", [{ baseUrl: validBaseUrl, path: "/api/admin", method: "GET" }]),
    ).toThrow(IpcValidationError);
  });

  it("rejects DELETE /api/loops (not allowlisted)", () => {
    expect(() =>
      validateIpc("api:request", [{ baseUrl: validBaseUrl, path: "/api/loops", method: "DELETE" }]),
    ).toThrow(IpcValidationError);
  });

  it("rejects POST /api/loops/{id}/execute (arbitrary command path)", () => {
    expect(() =>
      validateIpc("api:request", [{ baseUrl: validBaseUrl, path: "/api/loops/abc-123/execute", method: "POST" }]),
    ).toThrow(IpcValidationError);
  });

  it("defaults method to GET when omitted (and still enforces allowlist)", () => {
    // GET /api/loops is allowlisted
    expect(() =>
      validateIpc("api:request", [{ baseUrl: validBaseUrl, path: "/api/loops" }]),
    ).not.toThrow();

    // GET /api/admin is NOT allowlisted
    expect(() =>
      validateIpc("api:request", [{ baseUrl: validBaseUrl, path: "/api/admin" }]),
    ).toThrow(IpcValidationError);
  });

  it("rejects DELETE /api/projects (mutation on wrong endpoint)", () => {
    expect(() =>
      validateIpc("api:request", [{ baseUrl: validBaseUrl, path: "/api/projects", method: "DELETE" }]),
    ).toThrow(IpcValidationError);
  });

  it("includes allowlist message in error for disallowed operations", () => {
    try {
      validateIpc("api:request", [{ baseUrl: validBaseUrl, path: "/api/settings", method: "POST" }]);
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(IpcValidationError);
      const msg = (err as IpcValidationError).message;
      expect(msg).toContain("not allowlisted");
    }
  });

  it("rejects POST /api/users (arbitrary entity creation)", () => {
    expect(() =>
      validateIpc("api:request", [{ baseUrl: validBaseUrl, path: "/api/users", method: "POST" }]),
    ).toThrow(IpcValidationError);
  });

  it("rejects DELETE /api/loops/{id}/runs/{runId} (arbitrary nested path)", () => {
    expect(() =>
      validateIpc("api:request", [{ baseUrl: validBaseUrl, path: "/api/loops/abc-123/runs/run-42", method: "DELETE" }]),
    ).toThrow(IpcValidationError);
  });
});

// ── stream:subscribe allowlist enforcement ────────────────────────────

describe("stream:subscribe — allowlist enforcement", () => {
  const validBaseUrl = "http://localhost:13284";

  it("allows /api/loops/{id}/logs/stream (allowlisted)", () => {
    expect(() =>
      validateIpc("stream:subscribe", [{ subId: "sub-1", baseUrl: validBaseUrl, path: "/api/loops/abc-123/logs/stream" }]),
    ).not.toThrow();
  });

  it("allows /api/loops/{id}/logs/stream with query string", () => {
    expect(() =>
      validateIpc("stream:subscribe", [{ subId: "sub-2", baseUrl: validBaseUrl, path: "/api/loops/abc-123/logs/stream?tail=0" }]),
    ).not.toThrow();
  });

  it("rejects /api/loops/{id}/logs (non-stream endpoint)", () => {
    expect(() =>
      validateIpc("stream:subscribe", [{ subId: "sub-3", baseUrl: validBaseUrl, path: "/api/loops/abc-123/logs" }]),
    ).toThrow(IpcValidationError);
  });

  it("rejects /api/events (arbitrary SSE endpoint)", () => {
    expect(() =>
      validateIpc("stream:subscribe", [{ subId: "sub-4", baseUrl: validBaseUrl, path: "/api/events" }]),
    ).toThrow(IpcValidationError);
  });

  it("rejects /api/admin/stream (arbitrary stream path)", () => {
    expect(() =>
      validateIpc("stream:subscribe", [{ subId: "sub-5", baseUrl: validBaseUrl, path: "/api/admin/stream" }]),
    ).toThrow(IpcValidationError);
  });

  it("includes allowlist message in error for disallowed stream paths", () => {
    try {
      validateIpc("stream:subscribe", [{ subId: "sub-6", baseUrl: validBaseUrl, path: "/api/events" }]);
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(IpcValidationError);
      const msg = (err as IpcValidationError).message;
      expect(msg).toContain("not allowlisted");
    }
  });

  it("rejects /api/loops/{id}/exec/stream (arbitrary command stream)", () => {
    expect(() =>
      validateIpc("stream:subscribe", [{ subId: "sub-7", baseUrl: validBaseUrl, path: "/api/loops/abc-123/exec/stream" }]),
    ).toThrow(IpcValidationError);
  });
});
