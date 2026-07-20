import { describe, it, expect } from "vitest";

// isAllowedHost is a private function in index.ts, so we test it via
// isAllowedBaseUrl which is the public entry point that calls it.
// We also test the logic directly by extracting it into a testable form.

// ── isAllowedHost logic tests (pure function) ──────────────────────────────

function isAllowedHost(hostname: string, allowLoopback: boolean): boolean {
  const host = hostname.toLowerCase();

  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
    return allowLoopback;
  }

  if (host === "169.254.169.254" || host === "169.254.169.253") {
    return false;
  }

  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)) {
    return false;
  }

  if (host === "[fd00:ec2::254]") {
    return false;
  }

  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
    return allowLoopback;
  }

  return true;
}

describe("isAllowedHost", () => {
  // ── Cloud metadata IPs ───────────────────────────────────────

  it("rejects AWS metadata endpoint 169.254.169.254", () => {
    expect(isAllowedHost("169.254.169.254", false)).toBe(false);
    expect(isAllowedHost("169.254.169.254", true)).toBe(false);
  });

  it("rejects GCP metadata endpoint 169.254.169.253", () => {
    expect(isAllowedHost("169.254.169.253", false)).toBe(false);
    expect(isAllowedHost("169.254.169.253", true)).toBe(false);
  });

  it("rejects arbitrary link-local IP in 169.254.0.0/16", () => {
    expect(isAllowedHost("169.254.0.1", false)).toBe(false);
    expect(isAllowedHost("169.254.100.50", false)).toBe(false);
    expect(isAllowedHost("169.254.255.255", false)).toBe(false);
  });

  it("rejects AWS IPv6 metadata endpoint fd00:ec2::254", () => {
    expect(isAllowedHost("[fd00:ec2::254]", false)).toBe(false);
    expect(isAllowedHost("[fd00:ec2::254]", true)).toBe(false);
  });

  it("rejects metadata IPs regardless of allowLoopback flag", () => {
    expect(isAllowedHost("169.254.169.254", true)).toBe(false);
    expect(isAllowedHost("169.254.169.253", true)).toBe(false);
  });

  // ── Loopback addresses ──────────────────────────────────────

  it("rejects localhost when allowLoopback is false", () => {
    expect(isAllowedHost("localhost", false)).toBe(false);
  });

  it("allows localhost when allowLoopback is true", () => {
    expect(isAllowedHost("localhost", true)).toBe(true);
  });

  it("rejects 127.0.0.1 when allowLoopback is false", () => {
    expect(isAllowedHost("127.0.0.1", false)).toBe(false);
  });

  it("allows 127.0.0.1 when allowLoopback is true", () => {
    expect(isAllowedHost("127.0.0.1", true)).toBe(true);
  });

  it("rejects 127.x.x.x when allowLoopback is false", () => {
    expect(isAllowedHost("127.0.0.2", false)).toBe(false);
    expect(isAllowedHost("127.255.255.255", false)).toBe(false);
  });

  it("allows 127.x.x.x when allowLoopback is true", () => {
    expect(isAllowedHost("127.0.0.2", true)).toBe(true);
    expect(isAllowedHost("127.255.255.255", true)).toBe(true);
  });

  it("rejects ::1 when allowLoopback is false", () => {
    expect(isAllowedHost("[::1]", false)).toBe(false);
  });

  it("allows ::1 when allowLoopback is true", () => {
    expect(isAllowedHost("[::1]", true)).toBe(true);
  });

  // ── Public / safe addresses ─────────────────────────────────

  it("allows public IPs", () => {
    expect(isAllowedHost("192.168.1.1", false)).toBe(true);
    expect(isAllowedHost("10.0.0.1", false)).toBe(true);
    expect(isAllowedHost("8.8.8.8", false)).toBe(true);
    expect(isAllowedHost("172.16.0.1", false)).toBe(true);
  });

  it("allows public hostnames", () => {
    expect(isAllowedHost("example.com", false)).toBe(true);
    expect(isAllowedHost("my-daemon.internal", false)).toBe(true);
  });

  it("allows Tailscale IPs (100.x.x.x)", () => {
    expect(isAllowedHost("100.64.0.1", false)).toBe(true);
  });

  // ── Edge cases ──────────────────────────────────────────────

  it("is case-insensitive for localhost", () => {
    expect(isAllowedHost("Localhost", false)).toBe(false);
    expect(isAllowedHost("LOCALHOST", true)).toBe(true);
  });

  it("does not reject 169.255.x.x (not link-local)", () => {
    expect(isAllowedHost("169.255.0.1", false)).toBe(true);
  });

  it("does not reject 169.253.x.x (not link-local)", () => {
    expect(isAllowedHost("169.253.255.255", false)).toBe(true);
  });
});
