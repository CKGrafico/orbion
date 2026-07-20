import { describe, it, expect, vi } from "vitest";

// Mock electron before importing the module under test
vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
}));

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

// ── Integration: infra:executeAction validation ──────────────────────────

describe("validateIpc infra:executeAction", () => {
  // ── edit-issue is accepted ──────────────────────────────────────

  it("accepts edit-issue action with valid params", () => {
    const args = [{ action: "edit-issue", params: { issueNumber: 42, title: "Fix bug" } }];
    expect(() => validateIpc("infra:executeAction", args)).not.toThrow();
  });

  it("rejects edit-issue without issueNumber", () => {
    const args = [{ action: "edit-issue", params: { title: "Fix bug" } }];
    expect(() => validateIpc("infra:executeAction", args)).toThrow(IpcValidationError);
  });

  it("rejects edit-issue with non-number issueNumber", () => {
    const args = [{ action: "edit-issue", params: { issueNumber: "42" } }];
    expect(() => validateIpc("infra:executeAction", args)).toThrow(IpcValidationError);
  });

  // ── create-issue param validation ───────────────────────────────

  it("accepts create-issue with valid title", () => {
    const args = [{ action: "create-issue", params: { title: "Bug report" } }];
    expect(() => validateIpc("infra:executeAction", args)).not.toThrow();
  });

  it("rejects create-issue without title", () => {
    const args = [{ action: "create-issue", params: {} }];
    expect(() => validateIpc("infra:executeAction", args)).toThrow(IpcValidationError);
  });

  it("rejects create-issue with empty string title", () => {
    const args = [{ action: "create-issue", params: { title: "" } }];
    expect(() => validateIpc("infra:executeAction", args)).toThrow(IpcValidationError);
  });

  it("rejects create-issue with non-string title", () => {
    const args = [{ action: "create-issue", params: { title: 123 } }];
    expect(() => validateIpc("infra:executeAction", args)).toThrow(IpcValidationError);
  });

  // ── add-label param validation ─────────────────────────────────

  it("accepts add-label with valid issueNumber and labels", () => {
    const args = [{ action: "add-label", params: { issueNumber: 7, labels: ["bug"] } }];
    expect(() => validateIpc("infra:executeAction", args)).not.toThrow();
  });

  it("rejects add-label without issueNumber", () => {
    const args = [{ action: "add-label", params: { labels: ["bug"] } }];
    expect(() => validateIpc("infra:executeAction", args)).toThrow(IpcValidationError);
  });

  it("rejects add-label with non-number issueNumber", () => {
    const args = [{ action: "add-label", params: { issueNumber: "7", labels: ["bug"] } }];
    expect(() => validateIpc("infra:executeAction", args)).toThrow(IpcValidationError);
  });

  it("rejects add-label without labels array", () => {
    const args = [{ action: "add-label", params: { issueNumber: 7 } }];
    expect(() => validateIpc("infra:executeAction", args)).toThrow(IpcValidationError);
  });

  it("rejects add-label with non-array labels", () => {
    const args = [{ action: "add-label", params: { issueNumber: 7, labels: "bug" } }];
    expect(() => validateIpc("infra:executeAction", args)).toThrow(IpcValidationError);
  });

  it("rejects add-label with non-string label entries", () => {
    const args = [{ action: "add-label", params: { issueNumber: 7, labels: [123] } }];
    expect(() => validateIpc("infra:executeAction", args)).toThrow(IpcValidationError);
  });

  // ── unknown action is rejected ─────────────────────────────────

  it("rejects unknown action", () => {
    const args = [{ action: "delete-everything" }];
    expect(() => validateIpc("infra:executeAction", args)).toThrow(IpcValidationError);
  });

  // ── clone-repo still works ──────────────────────────────────────

  it("accepts clone-repo with valid repoUrl", () => {
    const args = [{ action: "clone-repo", params: { repoUrl: "https://github.com/org/repo" } }];
    expect(() => validateIpc("infra:executeAction", args)).not.toThrow();
  });

  it("rejects clone-repo without repoUrl", () => {
    const args = [{ action: "clone-repo", params: {} }];
    expect(() => validateIpc("infra:executeAction", args)).toThrow(IpcValidationError);
  });
});

// ── Blocklisted host validation (SSRF protection) ──────────────────────

describe("blocklisted host validation", () => {
  it("allows config:addEnvironment with a normal URL", () => {
    expect(() => validateIpc("config:addEnvironment", ["my-env", "http://192.168.1.50:8845", undefined])).not.toThrow();
  });

  it("allows config:addEnvironment with localhost URL", () => {
    expect(() => validateIpc("config:addEnvironment", ["my-env", "http://localhost:8845", undefined])).not.toThrow();
  });

  it("rejects config:addEnvironment with AWS metadata URL", () => {
    expect(() => validateIpc("config:addEnvironment", ["my-env", "http://169.254.169.254/api/projects", undefined])).toThrow(IpcValidationError);
  });

  it("rejects config:addEnvironment with GCP metadata URL", () => {
    expect(() => validateIpc("config:addEnvironment", ["my-env", "http://169.254.169.253/api/projects", undefined])).toThrow(IpcValidationError);
  });

  it("rejects config:addEnvironment with arbitrary link-local URL", () => {
    expect(() => validateIpc("config:addEnvironment", ["my-env", "http://169.254.100.50:8845", undefined])).toThrow(IpcValidationError);
  });

  it("allows config:addEndpoint with a normal URL", () => {
    expect(() => validateIpc("config:addEndpoint", ["env-1", "http://192.168.1.50:8845", "direct"])).not.toThrow();
  });

  it("allows config:addEndpoint with localhost URL", () => {
    expect(() => validateIpc("config:addEndpoint", ["env-1", "http://localhost:8845", "direct"])).not.toThrow();
  });

  it("rejects config:addEndpoint with AWS metadata URL", () => {
    expect(() => validateIpc("config:addEndpoint", ["env-1", "http://169.254.169.254:8845", "ssh"])).toThrow(IpcValidationError);
  });

  it("rejects config:addEndpoint with arbitrary link-local URL", () => {
    expect(() => validateIpc("config:addEndpoint", ["env-1", "http://169.254.0.1:8845", "ssh"])).toThrow(IpcValidationError);
  });
});
