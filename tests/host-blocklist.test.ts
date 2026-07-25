import { describe, it, expect } from "vitest";
import { isHostAllowed, isUrlAllowedForFetch, isAllowedBaseUrl } from "../src/main/ssrf-blocklist.js";

describe("isHostAllowed", () => {
  it("rejects AWS metadata endpoint 169.254.169.254", () => {
    expect(isHostAllowed("169.254.169.254")).toBe(false);
    expect(isHostAllowed("169.254.169.254", { allowLoopback: true })).toBe(false);
  });

  it("rejects GCP metadata endpoint 169.254.169.253", () => {
    expect(isHostAllowed("169.254.169.253")).toBe(false);
    expect(isHostAllowed("169.254.169.253", { allowLoopback: true })).toBe(false);
  });

  it("rejects arbitrary link-local IP in 169.254.0.0/16", () => {
    expect(isHostAllowed("169.254.0.1")).toBe(false);
    expect(isHostAllowed("169.254.100.50")).toBe(false);
    expect(isHostAllowed("169.254.255.255")).toBe(false);
  });

  it("rejects AWS IPv6 metadata endpoint fd00:ec2::254", () => {
    expect(isHostAllowed("[fd00:ec2::254]")).toBe(false);
    expect(isHostAllowed("[fd00:ec2::254]", { allowLoopback: true })).toBe(false);
  });

  it("rejects metadata IPs regardless of allowLoopback flag", () => {
    expect(isHostAllowed("169.254.169.254", { allowLoopback: true })).toBe(false);
    expect(isHostAllowed("169.254.169.253", { allowLoopback: true })).toBe(false);
  });

  it("rejects GCP metadata hostname metadata.google.internal", () => {
    expect(isHostAllowed("metadata.google.internal")).toBe(false);
    expect(isHostAllowed("metadata.google.internal", { allowLoopback: true })).toBe(false);
  });

  it("rejects Azure metadata hostname metadata.azure.internal", () => {
    expect(isHostAllowed("metadata.azure.internal")).toBe(false);
    expect(isHostAllowed("metadata.azure.internal", { allowLoopback: true })).toBe(false);
  });

  it("rejects GCP metadata hostname trailing-dot FQDN", () => {
    expect(isHostAllowed("metadata.google.internal.")).toBe(false);
  });

  it("rejects Azure metadata hostname trailing-dot FQDN", () => {
    expect(isHostAllowed("metadata.azure.internal.")).toBe(false);
  });

  it("rejects IPv6 link-local fe80::/10 addresses", () => {
    expect(isHostAllowed("[fe80::1]")).toBe(false);
    expect(isHostAllowed("[fe80::1234:5678]")).toBe(false);
    expect(isHostAllowed("[fe8f::1]")).toBe(false);
    expect(isHostAllowed("[fe80::1]", { allowLoopback: true })).toBe(false);
  });

  it("allows non-link-local IPv6 addresses starting with fe9+", () => {
    expect(isHostAllowed("fe90::1")).toBe(true);
    expect(isHostAllowed("fee0::1")).toBe(true);
  });

  it("does not treat bare fe80 hostname (no brackets) as IPv6 link-local", () => {
    expect(isHostAllowed("fe80::1")).toBe(true);
  });

  it("rejects localhost when allowLoopback is false (default)", () => {
    expect(isHostAllowed("localhost")).toBe(false);
  });

  it("allows localhost when allowLoopback is true", () => {
    expect(isHostAllowed("localhost", { allowLoopback: true })).toBe(true);
  });

  it("rejects 127.0.0.1 when allowLoopback is false", () => {
    expect(isHostAllowed("127.0.0.1")).toBe(false);
  });

  it("allows 127.0.0.1 when allowLoopback is true", () => {
    expect(isHostAllowed("127.0.0.1", { allowLoopback: true })).toBe(true);
  });

  it("rejects 127.x.x.x when allowLoopback is false", () => {
    expect(isHostAllowed("127.0.0.2")).toBe(false);
    expect(isHostAllowed("127.255.255.255")).toBe(false);
  });

  it("allows 127.x.x.x when allowLoopback is true", () => {
    expect(isHostAllowed("127.0.0.2", { allowLoopback: true })).toBe(true);
    expect(isHostAllowed("127.255.255.255", { allowLoopback: true })).toBe(true);
  });

  it("rejects ::1 when allowLoopback is false", () => {
    expect(isHostAllowed("[::1]")).toBe(false);
  });

  it("allows ::1 when allowLoopback is true", () => {
    expect(isHostAllowed("[::1]", { allowLoopback: true })).toBe(true);
  });

  it("allows public IPs", () => {
    expect(isHostAllowed("192.168.1.1")).toBe(true);
    expect(isHostAllowed("10.0.0.1")).toBe(true);
    expect(isHostAllowed("8.8.8.8")).toBe(true);
    expect(isHostAllowed("172.16.0.1")).toBe(true);
  });

  it("allows public hostnames", () => {
    expect(isHostAllowed("example.com")).toBe(true);
    expect(isHostAllowed("my-daemon.internal")).toBe(true);
  });

  it("allows Tailscale IPs (100.x.x.x)", () => {
    expect(isHostAllowed("100.64.0.1")).toBe(true);
  });

  it("is case-insensitive for localhost", () => {
    expect(isHostAllowed("Localhost")).toBe(false);
    expect(isHostAllowed("LOCALHOST", { allowLoopback: true })).toBe(true);
  });

  it("is case-insensitive for metadata.google.internal", () => {
    expect(isHostAllowed("Metadata.Google.Internal")).toBe(false);
  });

  it("is case-insensitive for metadata.azure.internal", () => {
    expect(isHostAllowed("Metadata.Azure.Internal")).toBe(false);
  });

  it("does not reject 169.255.x.x (not link-local)", () => {
    expect(isHostAllowed("169.255.0.1")).toBe(true);
  });

  it("does not reject 169.253.x.x (not link-local)", () => {
    expect(isHostAllowed("169.253.255.255")).toBe(true);
  });
});

describe("isUrlAllowedForFetch", () => {
  it("allows https URLs to public hosts", () => {
    expect(isUrlAllowedForFetch(new URL("https://example.com/api"))).toBe(true);
  });

  it("rejects http URLs to 169.254.169.254", () => {
    expect(isUrlAllowedForFetch(new URL("http://169.254.169.254/latest/meta-data/"))).toBe(false);
  });

  it("rejects non-http protocols", () => {
    expect(isUrlAllowedForFetch(new URL("file:///etc/passwd"))).toBe(false);
  });

  it("rejects localhost without allowLoopback", () => {
    expect(isUrlAllowedForFetch(new URL("http://localhost:8080/api"))).toBe(false);
  });

  it("allows localhost with allowLoopback", () => {
    expect(isUrlAllowedForFetch(new URL("http://localhost:8080/api"), { allowLoopback: true })).toBe(true);
  });

  it("rejects metadata.google.internal regardless of allowLoopback", () => {
    expect(isUrlAllowedForFetch(new URL("http://metadata.google.internal/computeMetadata/v1/"))).toBe(false);
    expect(isUrlAllowedForFetch(new URL("http://metadata.google.internal/computeMetadata/v1/"), { allowLoopback: true })).toBe(false);
  });

  it("rejects metadata.azure.internal regardless of allowLoopback", () => {
    expect(isUrlAllowedForFetch(new URL("http://metadata.azure.internal/metadata/instance?api-version=2021-02-01"))).toBe(false);
    expect(isUrlAllowedForFetch(new URL("http://metadata.azure.internal/metadata/instance?api-version=2021-02-01"), { allowLoopback: true })).toBe(false);
  });

  it("rejects IPv6 link-local regardless of allowLoopback", () => {
    expect(isUrlAllowedForFetch(new URL("http://[fe80::1]/"))).toBe(false);
    expect(isUrlAllowedForFetch(new URL("http://[fe80::1]/"), { allowLoopback: true })).toBe(false);
  });
});

describe("isAllowedBaseUrl", () => {
  it("allows valid https URLs to public hosts", () => {
    expect(isAllowedBaseUrl("https://example.com")).toBe(true);
  });

  it("allows valid http URLs to public hosts", () => {
    expect(isAllowedBaseUrl("http://8.8.8.8")).toBe(true);
  });

  it("rejects invalid URLs", () => {
    expect(isAllowedBaseUrl("not-a-url")).toBe(false);
  });

  it("rejects non-http protocols", () => {
    expect(isAllowedBaseUrl("ftp://example.com")).toBe(false);
  });

  it("rejects metadata IPs", () => {
    expect(isAllowedBaseUrl("http://169.254.169.254")).toBe(false);
    expect(isAllowedBaseUrl("http://169.254.169.254", { allowLoopback: true })).toBe(false);
  });

  it("rejects cloud metadata hostnames", () => {
    expect(isAllowedBaseUrl("http://metadata.google.internal")).toBe(false);
    expect(isAllowedBaseUrl("http://metadata.azure.internal")).toBe(false);
  });

  it("rejects localhost without allowLoopback", () => {
    expect(isAllowedBaseUrl("http://localhost:8080")).toBe(false);
  });

  it("allows localhost with allowLoopback", () => {
    expect(isAllowedBaseUrl("http://localhost:8080", { allowLoopback: true })).toBe(true);
  });

  it("allows loopback 127.0.0.1 with allowLoopback", () => {
    expect(isAllowedBaseUrl("http://127.0.0.1:8080", { allowLoopback: true })).toBe(true);
  });
});

describe("IPC validation and fetch path parity", () => {
  const testCases: Array<{ host: string; allowLoopback: boolean; expected: boolean }> = [
    { host: "169.254.169.254", allowLoopback: false, expected: false },
    { host: "169.254.169.253", allowLoopback: false, expected: false },
    { host: "169.254.0.1", allowLoopback: false, expected: false },
    { host: "169.254.100.50", allowLoopback: false, expected: false },
    { host: "[fd00:ec2::254]", allowLoopback: false, expected: false },
    { host: "metadata.google.internal", allowLoopback: false, expected: false },
    { host: "metadata.azure.internal", allowLoopback: false, expected: false },
    { host: "metadata.google.internal.", allowLoopback: false, expected: false },
    { host: "metadata.azure.internal.", allowLoopback: false, expected: false },
    { host: "[fe80::1]", allowLoopback: false, expected: false },
    { host: "[fe8f::1]", allowLoopback: false, expected: false },
    { host: "localhost", allowLoopback: false, expected: false },
    { host: "127.0.0.1", allowLoopback: false, expected: false },
    { host: "127.0.0.2", allowLoopback: false, expected: false },
    { host: "[::1]", allowLoopback: false, expected: false },
    { host: "localhost", allowLoopback: true, expected: true },
    { host: "127.0.0.1", allowLoopback: true, expected: true },
    { host: "127.0.0.2", allowLoopback: true, expected: true },
    { host: "[::1]", allowLoopback: true, expected: true },
    { host: "169.254.169.254", allowLoopback: true, expected: false },
    { host: "169.254.169.253", allowLoopback: true, expected: false },
    { host: "[fd00:ec2::254]", allowLoopback: true, expected: false },
    { host: "metadata.google.internal", allowLoopback: true, expected: false },
    { host: "metadata.azure.internal", allowLoopback: true, expected: false },
    { host: "[fe80::1]", allowLoopback: true, expected: false },
    { host: "8.8.8.8", allowLoopback: false, expected: true },
    { host: "example.com", allowLoopback: false, expected: true },
    { host: "100.64.0.1", allowLoopback: false, expected: true },
  ];

  for (const tc of testCases) {
    it(`isHostAllowed("${tc.host}", { allowLoopback: ${tc.allowLoopback} }) === ${tc.expected}`, () => {
      expect(isHostAllowed(tc.host, { allowLoopback: tc.allowLoopback })).toBe(tc.expected);
    });
  }
});
