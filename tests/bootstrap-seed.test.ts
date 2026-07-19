import { describe, it, expect } from "vitest";
import { encodeBootstrapSeed, decodeBootstrapSeed } from "../src/shared/utils.js";
import type { BootstrapSeed } from "../src/shared/ipc.js";

describe("encodeBootstrapSeed", () => {
  it("encodes an SSH seed", () => {
    const seed: BootstrapSeed = { kind: "ssh", target: "deploy@prod:22", name: "prod-vm" };
    expect(encodeBootstrapSeed(seed)).toBe("orbion://ssh:deploy@prod:22#prod-vm");
  });

  it("encodes a direct seed", () => {
    const seed: BootstrapSeed = { kind: "direct", target: "http://192.168.1.10:8845", name: "local-daemon" };
    expect(encodeBootstrapSeed(seed)).toBe("orbion://direct:http://192.168.1.10:8845#local-daemon");
  });

  it("percent-encodes the environment name in the fragment", () => {
    const seed: BootstrapSeed = { kind: "ssh", target: "user@host:22", name: "my vm" };
    expect(encodeBootstrapSeed(seed)).toBe("orbion://ssh:user@host:22#my%20vm");
  });
});

describe("decodeBootstrapSeed", () => {
  it("decodes an SSH seed", () => {
    const result = decodeBootstrapSeed("orbion://ssh:deploy@prod:22#prod-vm");
    expect(result).toEqual({ kind: "ssh", target: "deploy@prod:22", name: "prod-vm" });
  });

  it("decodes a direct seed", () => {
    const result = decodeBootstrapSeed("orbion://direct:http://192.168.1.10:8845#local-daemon");
    expect(result).toEqual({ kind: "direct", target: "http://192.168.1.10:8845", name: "local-daemon" });
  });

  it("decodes percent-encoded fragment", () => {
    const result = decodeBootstrapSeed("orbion://ssh:user@host:22#my%20vm");
    expect(result).toEqual({ kind: "ssh", target: "user@host:22", name: "my vm" });
  });

  it("returns null for missing scheme", () => {
    expect(decodeBootstrapSeed("ssh:user@host:22#name")).toBeNull();
  });

  it("returns null for unknown kind", () => {
    expect(decodeBootstrapSeed("orbion://tailscale:host#name")).toBeNull();
  });

  it("returns null for missing fragment separator", () => {
    expect(decodeBootstrapSeed("orbion://ssh:user@host:22")).toBeNull();
  });

  it("returns null for empty target", () => {
    expect(decodeBootstrapSeed("orbion://ssh:#name")).toBeNull();
  });

  it("returns null for empty name", () => {
    expect(decodeBootstrapSeed("orbion://ssh:user@host:22#")).toBeNull();
  });

  it("returns null for missing colon after kind", () => {
    expect(decodeBootstrapSeed("orbion://ssh#name")).toBeNull();
  });

  it("round-trips SSH seed through encode then decode", () => {
    const seed: BootstrapSeed = { kind: "ssh", target: "root@server:2222", name: "prod" };
    expect(decodeBootstrapSeed(encodeBootstrapSeed(seed))).toEqual(seed);
  });

  it("round-trips direct seed through encode then decode", () => {
    const seed: BootstrapSeed = { kind: "direct", target: "http://10.0.0.5:8845", name: "dev" };
    expect(decodeBootstrapSeed(encodeBootstrapSeed(seed))).toEqual(seed);
  });
});
