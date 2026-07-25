import { describe, it, expect, vi } from "vitest";
import { isUrlAllowedForFetch } from "../src/main/ssrf-allowlist.js";

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
}));

import { validateIpc, IpcValidationError } from "../src/main/ipc-validation.js";


function check(hostname: string, allowLoopback: boolean): boolean {
  const url = new URL(`http://${hostname}/`);
  return isUrlAllowedForFetch(url, { allowLoopback });
}

describe("isUrlAllowedForFetch", () => {
  it("rejects AWS metadata endpoint 169.254.169.254", () => {
    expect(check("169.254.169.254", false)).toBe(false);
    expect(check("169.254.169.254", true)).toBe(false);
  });

  it("rejects GCP metadata endpoint 169.254.169.253", () => {
    expect(check("169.254.169.253", false)).toBe(false);
    expect(check("169.254.169.253", true)).toBe(false);
  });

  it("rejects arbitrary link-local IP in 169.254.0.0/16", () => {
    expect(check("169.254.0.1", false)).toBe(false);
    expect(check("169.254.100.50", false)).toBe(false);
    expect(check("169.254.255.255", false)).toBe(false);
  });

  it("rejects AWS IPv6 metadata endpoint fd00:ec2::254", () => {
    expect(check("[fd00:ec2::254]", false)).toBe(false);
    expect(check("[fd00:ec2::254]", true)).toBe(false);
  });

  it("rejects metadata IPs regardless of allowLoopback flag", () => {
    expect(check("169.254.169.254", true)).toBe(false);
    expect(check("169.254.169.253", true)).toBe(false);
  });

  it("rejects localhost when allowLoopback is false", () => {
    expect(check("localhost", false)).toBe(false);
  });

  it("allows localhost when allowLoopback is true", () => {
    expect(check("localhost", true)).toBe(true);
  });

  it("rejects 127.0.0.1 when allowLoopback is false", () => {
    expect(check("127.0.0.1", false)).toBe(false);
  });

  it("allows 127.0.0.1 when allowLoopback is true", () => {
    expect(check("127.0.0.1", true)).toBe(true);
  });

  it("rejects 127.x.x.x when allowLoopback is false", () => {
    expect(check("127.0.0.2", false)).toBe(false);
    expect(check("127.255.255.255", false)).toBe(false);
  });

  it("allows 127.x.x.x when allowLoopback is true", () => {
    expect(check("127.0.0.2", true)).toBe(true);
    expect(check("127.255.255.255", true)).toBe(true);
  });

  it("rejects ::1 when allowLoopback is false", () => {
    expect(check("[::1]", false)).toBe(false);
  });

  it("allows ::1 when allowLoopback is true", () => {
    expect(check("[::1]", true)).toBe(true);
  });

  it("allows public IPs", () => {
    expect(check("192.168.1.1", false)).toBe(true);
    expect(check("10.0.0.1", false)).toBe(true);
    expect(check("8.8.8.8", false)).toBe(true);
    expect(check("172.16.0.1", false)).toBe(true);
  });

  it("allows public hostnames", () => {
    expect(check("example.com", false)).toBe(true);
    expect(check("my-daemon.internal", false)).toBe(true);
  });

  it("allows Tailscale IPs (100.x.x.x)", () => {
    expect(check("100.64.0.1", false)).toBe(true);
  });

  it("is case-insensitive for localhost", () => {
    expect(check("Localhost", false)).toBe(false);
    expect(check("LOCALHOST", true)).toBe(true);
  });

  it("does not reject 169.255.x.x (not link-local)", () => {
    expect(check("169.255.0.1", false)).toBe(true);
  });

  it("does not reject 169.253.x.x (not link-local)", () => {
    expect(check("169.253.255.255", false)).toBe(true);
  });

  it("rejects IPv6 link-local fe80::1", () => {
    expect(check("[fe80::1]", false)).toBe(false);
    expect(check("[fe80::1]", true)).toBe(false);
  });

  it("rejects IPv6 link-local regardless of allowLoopback", () => {
    expect(check("[fe80::abcd:efff:fe12:3456]", false)).toBe(false);
    expect(check("[fe80::abcd:efff:fe12:3456]", true)).toBe(false);
  });

  it("rejects GCP metadata DNS hostname", () => {
    expect(check("metadata.google.internal", false)).toBe(false);
    expect(check("metadata.google.internal", true)).toBe(false);
  });

  it("rejects GCP metadata DNS hostname with trailing dot", () => {
    expect(check("metadata.google.internal.", false)).toBe(false);
    expect(check("metadata.google.internal.", true)).toBe(false);
  });

  it("allows unrelated google internal hostname", () => {
    expect(check("something.google.internal", false)).toBe(true);
  });

  it("rejects IPv6 link-local uppercase form", () => {
    expect(check("[FE80::1]", false)).toBe(false);
  });
});

describe("cross-path SSRF consistency", () => {
  const testHosts = [
    { host: "169.254.169.254", blocked: true },
    { host: "169.254.169.253", blocked: true },
    { host: "169.254.0.1", blocked: true },
    { host: "[fd00:ec2::254]", blocked: true },
    { host: "[fe80::1]", blocked: true },
    { host: "[FE80::1]", blocked: true },
    { host: "metadata.google.internal", blocked: true },
    { host: "metadata.google.internal.", blocked: true },
    { host: "localhost", blocked: false },
    { host: "127.0.0.1", blocked: false },
    { host: "[::1]", blocked: false },
    { host: "example.com", blocked: false },
    { host: "8.8.8.8", blocked: false },
  ];

  it("ipc-validation and isUrlAllowedForFetch agree on blocked hosts", () => {
    const blockedHosts = [
      "169.254.169.254",
      "169.254.169.253",
      "169.254.0.1",
      "[fd00:ec2::254]",
      "[fe80::1]",
      "metadata.google.internal",
    ];
    for (const host of blockedHosts) {
      const url = `http://${host}/api`;
      const canonicalResult = isUrlAllowedForFetch(new URL(url), { allowLoopback: true });
      expect(canonicalResult, `host=${host} canonical`).toBe(false);
      expect(() => validateIpc("config:addEnvironment", ["test-env", url, undefined]), `host=${host} ipc`).toThrow(IpcValidationError);
    }
  });

  it("ipc-validation and isUrlAllowedForFetch agree on allowed hosts", () => {
    const allowedHosts = ["example.com", "8.8.8.8", "192.168.1.1", "localhost"];
    for (const host of allowedHosts) {
      const url = `http://${host}/api`;
      const urlObj = new URL(url);
      const allowLoopback = host === "localhost";
      const canonicalResult = isUrlAllowedForFetch(urlObj, { allowLoopback });
      expect(canonicalResult, `host=${host} canonical`).toBe(true);
      expect(() => validateIpc("config:addEnvironment", ["test-env", url, undefined]), `host=${host} ipc`).not.toThrow();
    }
  });

  it("both paths reject metadata IPs even with allowLoopback", () => {
    const metadataIps = ["169.254.169.254", "169.254.169.253", "[fd00:ec2::254]"];
    for (const ip of metadataIps) {
      const url = new URL(`http://${ip}/api`);
      expect(isUrlAllowedForFetch(url, { allowLoopback: true }), `ip=${ip}`).toBe(false);
      expect(isUrlAllowedForFetch(url, { allowLoopback: false }), `ip=${ip}`).toBe(false);
    }
  });
});
