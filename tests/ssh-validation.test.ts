import { describe, it, expect } from "vitest";
import { validateSshHost, SshValidationError, buildSshArgs, parseTarget } from "../src/main/ssh-config.js";

function makeHost(overrides: Record<string, string | number | undefined> = {}): Parameters<typeof validateSshHost>[0] {
  return {
    host: "example.com",
    hostName: "example.com",
    user: "root",
    port: 22,
    label: "root@example.com",
    ...overrides,
  };
}

describe("validateSshHost", () => {
  it("accepts a valid host", () => {
    expect(() => validateSshHost(makeHost())).not.toThrow();
  });

  it("accepts a host with hyphens and dots", () => {
    expect(() => validateSshHost(makeHost({ hostName: "my-host.example.com", host: "my-host.example.com" }))).not.toThrow();
  });

  it("accepts a host with identityFile", () => {
    expect(() => validateSshHost(makeHost({ identityFile: "/home/user/.ssh/id_rsa" }))).not.toThrow();
  });

  it("accepts a host with tilde in identityFile", () => {
    expect(() => validateSshHost(makeHost({ identityFile: "~/.ssh/id_ed25519" }))).not.toThrow();
  });

  // ── hostName ──────────────────────────────────────────────

  it("rejects hostName with spaces", () => {
    expect(() => validateSshHost(makeHost({ hostName: "evil host", host: "evil host" }))).toThrow(SshValidationError);
  });

  it("rejects hostName with shell metacharacters ($)", () => {
    expect(() => validateSshHost(makeHost({ hostName: "$(whoami)", host: "$(whoami)" }))).toThrow(SshValidationError);
  });

  it("rejects hostName with backticks", () => {
    expect(() => validateSshHost(makeHost({ hostName: "`id`", host: "`id`" }))).toThrow(SshValidationError);
  });

  it("rejects hostName starting with a dash (flag injection)", () => {
    expect(() => validateSshHost(makeHost({ hostName: "-oProxyCommand=evil", host: "-oProxyCommand=evil" }))).toThrow(SshValidationError);
  });

  it("rejects hostName with semicolons", () => {
    expect(() => validateSshHost(makeHost({ hostName: "host;rm -rf /", host: "host;rm -rf /" }))).toThrow(SshValidationError);
  });

  it("rejects empty hostName", () => {
    expect(() => validateSshHost(makeHost({ hostName: "", host: "" }))).toThrow(SshValidationError);
  });

  // ── user ──────────────────────────────────────────────────

  it("rejects user with spaces", () => {
    expect(() => validateSshHost(makeHost({ user: "evil user" }))).toThrow(SshValidationError);
  });

  it("rejects user with shell metacharacters", () => {
    expect(() => validateSshHost(makeHost({ user: "$(whoami)" }))).toThrow(SshValidationError);
  });

  it("rejects user starting with a dash", () => {
    expect(() => validateSshHost(makeHost({ user: "-Fconfig" }))).toThrow(SshValidationError);
  });

  it("rejects empty user", () => {
    expect(() => validateSshHost(makeHost({ user: "" }))).toThrow(SshValidationError);
  });

  it("accepts user with underscore", () => {
    expect(() => validateSshHost(makeHost({ user: "deploy_bot" }))).not.toThrow();
  });

  // ── identityFile ──────────────────────────────────────────

  it("rejects identityFile with spaces", () => {
    expect(() => validateSshHost(makeHost({ identityFile: "/evil path/key" }))).toThrow(SshValidationError);
  });

  it("rejects identityFile starting with a dash", () => {
    expect(() => validateSshHost(makeHost({ identityFile: "-oProxyCommand=evil" }))).toThrow(SshValidationError);
  });

  it("rejects identityFile with shell metacharacters", () => {
    expect(() => validateSshHost(makeHost({ identityFile: "/tmp/key;rm -rf /" }))).toThrow(SshValidationError);
  });

  it("accepts undefined identityFile", () => {
    expect(() => validateSshHost(makeHost({ identityFile: undefined }))).not.toThrow();
  });

  it("accepts empty string identityFile", () => {
    expect(() => validateSshHost(makeHost({ identityFile: "" }))).not.toThrow();
  });

  // ── host (alias) ─────────────────────────────────────────

  it("rejects host field with shell metacharacters", () => {
    expect(() => validateSshHost(makeHost({ host: "$(evil)" }))).toThrow(SshValidationError);
  });
});

describe("buildSshArgs", () => {
  it("validates the host before building args", () => {
    const evil = makeHost({ hostName: "$(whoami)", host: "$(whoami)" });
    expect(() => buildSshArgs(evil, "echo hello")).toThrow(SshValidationError);
  });

  it("returns correct args for a valid host", () => {
    const args = buildSshArgs(makeHost(), "echo hello");
    expect(args).toContain("root@example.com");
    expect(args).toContain("echo hello");
    expect(args).toContain("StrictHostKeyChecking=accept-new");
  });

  it("includes identityFile when set", () => {
    const args = buildSshArgs(makeHost({ identityFile: "~/.ssh/id_ed25519" }), "ls");
    expect(args).toContain("-i");
    expect(args).toContain("~/.ssh/id_ed25519");
  });

  it("includes custom port when not 22", () => {
    const args = buildSshArgs(makeHost({ port: 2222 }), "ls");
    expect(args).toContain("-p");
    expect(args).toContain("2222");
  });
});

describe("parseTarget", () => {
  it("parses a valid target string", () => {
    const host = parseTarget("root@example.com");
    expect(host).not.toBeNull();
    expect(host!.user).toBe("root");
    expect(host!.hostName).toBe("example.com");
  });

  it("parses a target with port", () => {
    const host = parseTarget("root@example.com:2222");
    expect(host).not.toBeNull();
    expect(host!.port).toBe(2222);
  });

  it("rejects an invalid target format", () => {
    expect(parseTarget("not-a-target")).toBeNull();
  });

  it("rejects target with shell metacharacters in user", () => {
    expect(parseTarget("$(whoami)@example.com")).toBeNull();
  });

  it("rejects target with shell metacharacters in hostname", () => {
    expect(parseTarget("root@$(whoami)")).toBeNull();
  });

  it("rejects target with spaces in hostname", () => {
    expect(parseTarget("root@evil host")).toBeNull();
  });

  it("rejects target with semicolons in user", () => {
    expect(parseTarget("root;rm@host")).toBeNull();
  });
});
