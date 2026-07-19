import { describe, it, expect } from "vitest";
import {
  isAllowedApiOperation,
  isAllowedStreamPath,
  findAllowedOperation,
  ALLOWED_API_OPERATIONS,
  ALLOWED_STREAM_PATHS,
} from "../../shared/daemon-allowlist";

// ── Positive tests: every supported operation must pass ───────────────

describe("isAllowedApiOperation — positive tests", () => {
  it("allows GET /api/loops", () => {
    expect(isAllowedApiOperation("GET", "/api/loops")).toBe(true);
  });

  it("allows GET /api/loops/{id} with typical loop IDs", () => {
    expect(isAllowedApiOperation("GET", "/api/loops/abc-123")).toBe(true);
    expect(isAllowedApiOperation("GET", "/api/loops/my_loop")).toBe(true);
  });

  it("allows GET /api/loops/{id}/logs with query string", () => {
    expect(isAllowedApiOperation("GET", "/api/loops/abc-123/logs?tail=50")).toBe(true);
  });

  it("allows GET /api/loops/{id}/logs without query string", () => {
    expect(isAllowedApiOperation("GET", "/api/loops/abc-123/logs")).toBe(true);
  });

  it("allows GET /api/projects", () => {
    expect(isAllowedApiOperation("GET", "/api/projects")).toBe(true);
  });

  it("allows GET /api/tasks", () => {
    expect(isAllowedApiOperation("GET", "/api/tasks")).toBe(true);
  });

  it("allows GET /api/settings", () => {
    expect(isAllowedApiOperation("GET", "/api/settings")).toBe(true);
  });

  it("allows POST /api/loops/{id}/pause", () => {
    expect(isAllowedApiOperation("POST", "/api/loops/abc-123/pause")).toBe(true);
  });

  it("allows POST /api/loops/{id}/resume", () => {
    expect(isAllowedApiOperation("POST", "/api/loops/abc-123/resume")).toBe(true);
  });

  it("allows POST /api/loops/{id}/trigger", () => {
    expect(isAllowedApiOperation("POST", "/api/loops/abc-123/trigger")).toBe(true);
  });

  it("allows POST /api/repos/clone", () => {
    expect(isAllowedApiOperation("POST", "/api/repos/clone")).toBe(true);
  });
});

// ── Negative tests: arbitrary/unsupported operations must be rejected ──

describe("isAllowedApiOperation — negative tests", () => {
  it("rejects DELETE /api/loops (delete all loops)", () => {
    expect(isAllowedApiOperation("DELETE", "/api/loops")).toBe(false);
  });

  it("rejects DELETE /api/loops/{id} (delete a loop)", () => {
    expect(isAllowedApiOperation("DELETE", "/api/loops/abc-123")).toBe(false);
  });

  it("rejects PATCH /api/loops/{id} (arbitrary mutation)", () => {
    expect(isAllowedApiOperation("PATCH", "/api/loops/abc-123")).toBe(false);
  });

  it("rejects POST /api/loops (create a loop — not allowed via renderer)", () => {
    expect(isAllowedApiOperation("POST", "/api/loops")).toBe(false);
  });

  it("rejects POST /api/settings (modify daemon settings)", () => {
    expect(isAllowedApiOperation("POST", "/api/settings")).toBe(false);
  });

  it("rejects PATCH /api/settings (partial update of settings)", () => {
    expect(isAllowedApiOperation("PATCH", "/api/settings")).toBe(false);
  });

  it("rejects DELETE /api/settings (delete settings)", () => {
    expect(isAllowedApiOperation("DELETE", "/api/settings")).toBe(false);
  });

  it("rejects POST /api/projects (create a project)", () => {
    expect(isAllowedApiOperation("POST", "/api/projects")).toBe(false);
  });

  it("rejects DELETE /api/projects (delete projects)", () => {
    expect(isAllowedApiOperation("DELETE", "/api/projects")).toBe(false);
  });

  it("rejects POST /api/tasks (create a task)", () => {
    expect(isAllowedApiOperation("POST", "/api/tasks")).toBe(false);
  });

  it("rejects DELETE /api/tasks (delete tasks)", () => {
    expect(isAllowedApiOperation("DELETE", "/api/tasks")).toBe(false);
  });

  it("rejects POST /api/loops/{id}/cancel (unsupported mutation)", () => {
    expect(isAllowedApiOperation("POST", "/api/loops/abc-123/cancel")).toBe(false);
  });

  it("rejects DELETE /api/repos/clone (wrong method)", () => {
    expect(isAllowedApiOperation("DELETE", "/api/repos/clone")).toBe(false);
  });

  it("rejects GET /api/admin (arbitrary endpoint)", () => {
    expect(isAllowedApiOperation("GET", "/api/admin")).toBe(false);
  });

  it("rejects POST /api/users (arbitrary endpoint)", () => {
    expect(isAllowedApiOperation("POST", "/api/users")).toBe(false);
  });

  it("rejects DELETE /api/loops/{id}/runs/{runId} (arbitrary nested path)", () => {
    expect(isAllowedApiOperation("DELETE", "/api/loops/abc-123/runs/run-42")).toBe(false);
  });

  it("rejects POST /api/loops/{id}/execute (arbitrary command-like path)", () => {
    expect(isAllowedApiOperation("POST", "/api/loops/abc-123/execute")).toBe(false);
  });

  it("rejects GET /api/loops/{id}/secrets (sensitive data)", () => {
    expect(isAllowedApiOperation("GET", "/api/loops/abc-123/secrets")).toBe(false);
  });

  it("rejects PATCH /api/loops/{id}/pause (wrong method for pause)", () => {
    expect(isAllowedApiOperation("PATCH", "/api/loops/abc-123/pause")).toBe(false);
  });

  it("rejects GET /api/loops/{id}/pause (wrong method — pause is POST only)", () => {
    expect(isAllowedApiOperation("GET", "/api/loops/abc-123/pause")).toBe(false);
  });
});

// ── Stream allowlist tests ────────────────────────────────────────────

describe("isAllowedStreamPath — positive tests", () => {
  it("allows /api/loops/{id}/logs/stream", () => {
    expect(isAllowedStreamPath("/api/loops/abc-123/logs/stream")).toBe(true);
  });

  it("allows /api/loops/{id}/logs/stream with query string", () => {
    expect(isAllowedStreamPath("/api/loops/abc-123/logs/stream?tail=0")).toBe(true);
  });
});

describe("isAllowedStreamPath — negative tests", () => {
  it("rejects /api/loops (not a stream path)", () => {
    expect(isAllowedStreamPath("/api/loops")).toBe(false);
  });

  it("rejects /api/loops/{id}/logs (the non-stream log endpoint)", () => {
    expect(isAllowedStreamPath("/api/loops/abc-123/logs")).toBe(false);
  });

  it("rejects /api/events (arbitrary SSE-like path)", () => {
    expect(isAllowedStreamPath("/api/events")).toBe(false);
  });

  it("rejects /api/admin/stream (arbitrary stream path)", () => {
    expect(isAllowedStreamPath("/api/admin/stream")).toBe(false);
  });

  it("rejects /api/loops/{id}/exec/stream (arbitrary command stream)", () => {
    expect(isAllowedStreamPath("/api/loops/abc-123/exec/stream")).toBe(false);
  });
});

// ── findAllowedOperation helper ───────────────────────────────────────

describe("findAllowedOperation", () => {
  it("returns the matching operation for an allowed request", () => {
    const op = findAllowedOperation("POST", "/api/loops/abc-123/pause");
    expect(op).not.toBeNull();
    expect(op!.method).toBe("POST");
    expect(op!.description).toBe("Pause a loop");
  });

  it("returns null for a disallowed request", () => {
    expect(findAllowedOperation("DELETE", "/api/loops/abc-123")).toBeNull();
  });

  it("strips query string before matching", () => {
    const op = findAllowedOperation("GET", "/api/loops/abc-123/logs?tail=50");
    expect(op).not.toBeNull();
    expect(op!.description).toBe("Get loop logs (query params: tail)");
  });
});

// ── Allowlist completeness (guard rail) ───────────────────────────────

describe("allowlist completeness guard", () => {
  it("API operations list has exactly 10 entries", () => {
    // If this breaks, update the test count — but verify the change is intentional.
    expect(ALLOWED_API_OPERATIONS).toHaveLength(10);
  });

  it("Stream paths list has exactly 1 entry", () => {
    expect(ALLOWED_STREAM_PATHS).toHaveLength(1);
  });

  it("every API operation has a non-empty description", () => {
    for (const op of ALLOWED_API_OPERATIONS) {
      expect(op.description.length, `Missing description for ${op.method} ${op.pathPattern}`).toBeGreaterThan(0);
    }
  });
});
