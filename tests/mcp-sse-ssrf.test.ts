import { describe, it, expect } from "vitest";
import { isUrlAllowedForFetch } from "../src/main/ssrf-allowlist.js";

const MCP_OPTIONS = { allowLoopback: true };

describe("MCP SSE postEndpoint SSRF validation", () => {
  it("rejects AWS metadata endpoint in postEndpoint", () => {
    const url = new URL("http://169.254.169.254/latest/meta-data/");
    expect(isUrlAllowedForFetch(url, MCP_OPTIONS)).toBe(false);
  });

  it("rejects GCP metadata DNS hostname in postEndpoint", () => {
    const url = new URL("http://metadata.google.internal/computeMetadata/v1/");
    expect(isUrlAllowedForFetch(url, MCP_OPTIONS)).toBe(false);
  });

  it("rejects Azure metadata DNS hostname in postEndpoint", () => {
    const url = new URL("http://metadata.azure.internal/metadata/instance");
    expect(isUrlAllowedForFetch(url, MCP_OPTIONS)).toBe(false);
  });

  it("rejects IPv6 link-local in postEndpoint", () => {
    const url = new URL("http://[fe80::1]/path");
    expect(isUrlAllowedForFetch(url, MCP_OPTIONS)).toBe(false);
  });

  it("rejects AWS IPv6 metadata in postEndpoint", () => {
    const url = new URL("http://[fd00:ec2::254]/path");
    expect(isUrlAllowedForFetch(url, MCP_OPTIONS)).toBe(false);
  });

  it("allows relative-path postEndpoint (localhost via SSH tunnel)", () => {
    const url = new URL("http://localhost:8846/messages");
    expect(isUrlAllowedForFetch(url, MCP_OPTIONS)).toBe(true);
  });

  it("allows 127.0.0.1 postEndpoint (loopback with allowLoopback)", () => {
    const url = new URL("http://127.0.0.1:8846/messages");
    expect(isUrlAllowedForFetch(url, MCP_OPTIONS)).toBe(true);
  });

  it("allows public host postEndpoint", () => {
    const url = new URL("http://example.com/messages");
    expect(isUrlAllowedForFetch(url, MCP_OPTIONS)).toBe(true);
  });

  it("rejects link-local IP in postEndpoint even with allowLoopback", () => {
    const url = new URL("http://169.254.1.1/api");
    expect(isUrlAllowedForFetch(url, MCP_OPTIONS)).toBe(false);
  });
});
