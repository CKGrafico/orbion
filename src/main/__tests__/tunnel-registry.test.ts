import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────
// Mock ssh-tunnel and ssh-config before importing the module under test.

const mockTunnelHandles = new Map<string, { process: { exitCode: number | null }; localPort: number; remotePort: number }>();

vi.mock("../ssh-tunnel.js", () => ({
  openTunnel: vi.fn(async (_host, localPort, remotePort) => {
    const tunnelId = `mock-${_host.user}@${_host.hostName}:${remotePort}`;
    mockTunnelHandles.set(tunnelId, { process: { exitCode: null }, localPort, remotePort });
    return { forwarded: true, localPort, errorDetail: null };
  }),
  closeTunnel: vi.fn((tunnelId: string) => {
    mockTunnelHandles.delete(tunnelId);
  }),
  closeAllTunnels: vi.fn(() => {
    mockTunnelHandles.clear();
  }),
  getTunnelId: vi.fn((host, remotePort) => `${host.user}@${host.hostName}:${remotePort}`),
  findExistingTunnel: vi.fn((_host, _remotePort) => undefined),
  onTunnelExit: vi.fn(),
  isTunnelAlive: vi.fn((_tunnelId: string) => true),
}));

vi.mock("../ssh-config.js", () => ({
  parseTarget: vi.fn((target: string) => {
    const m = /^([^@]+)@([^:]+)(?::(\d+))?$/.exec(target.trim());
    if (!m) return null;
    return {
      host: m[2],
      hostName: m[2],
      user: m[1],
      port: m[3] ? parseInt(m[3], 10) : 22,
      identityFile: undefined,
      label: target.trim(),
    };
  }),
  listSshHosts: vi.fn(() => []),
  validateSshHost: vi.fn(),
}));

// Import after mocks
import {
  resolveSshTarget,
  resolveEffectiveUrl,
  openTunnelForEndpoint,
  closeTunnelForEndpoint,
  closeTunnelsForEnvironment,
  closeAllRegistryTunnels,
  getTunnelLocalPort,
  openTunnelsForEnvironment,
  getTunneledEnvironmentIds,
  isTunnelReconnecting,
  onTunnelReconnect,
} from "../tunnel-registry";
import type { AccessEndpoint } from "../../shared/ipc.js";

function makeSshEndpoint(overrides: Partial<AccessEndpoint> = {}): AccessEndpoint {
  return {
    id: "ep-1",
    kind: "ssh",
    url: "http://my-vm:8845",
    sshTarget: "root@my-vm",
    lastError: null,
    failureCount: 0,
    ...overrides,
  };
}

function makeDirectEndpoint(overrides: Partial<AccessEndpoint> = {}): AccessEndpoint {
  return {
    id: "ep-2",
    kind: "direct",
    url: "http://localhost:8845",
    sshTarget: null,
    lastError: null,
    failureCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTunnelHandles.clear();
  // Reset the registry by closing all tunnels between tests
  closeAllRegistryTunnels();
});

// ── resolveSshTarget ────────────────────────────────────────────────────

describe("resolveSshTarget", () => {
  it("returns null for non-SSH endpoints", () => {
    const ep = makeDirectEndpoint();
    expect(resolveSshTarget(ep)).toBeNull();
  });

  it("returns null for SSH endpoint with no sshTarget", () => {
    const ep = makeSshEndpoint({ sshTarget: null });
    expect(resolveSshTarget(ep)).toBeNull();
  });

  it("parses sshTarget in user@host format", () => {
    const ep = makeSshEndpoint({ sshTarget: "deploy@prod-server" });
    const result = resolveSshTarget(ep);
    expect(result).not.toBeNull();
    expect(result!.host.user).toBe("deploy");
    expect(result!.host.hostName).toBe("prod-server");
  });

  it("parses sshTarget in user@host:port format", () => {
    const ep = makeSshEndpoint({ sshTarget: "admin@my-vm:2222" });
    const result = resolveSshTarget(ep);
    expect(result).not.toBeNull();
    expect(result!.host.port).toBe(2222);
  });

  it("extracts remote port from the endpoint URL", () => {
    const ep = makeSshEndpoint({ url: "http://my-vm:9999" });
    const result = resolveSshTarget(ep);
    expect(result).not.toBeNull();
    expect(result!.remotePort).toBe(9999);
  });

  it("defaults remote port to 8845 when URL has no port", () => {
    const ep = makeSshEndpoint({ url: "http://my-vm" });
    const result = resolveSshTarget(ep);
    expect(result).not.toBeNull();
    expect(result!.remotePort).toBe(8845);
  });
});

// ── resolveEffectiveUrl ─────────────────────────────────────────────────

describe("resolveEffectiveUrl", () => {
  it("returns original URL for direct endpoints", () => {
    const ep = makeDirectEndpoint();
    expect(resolveEffectiveUrl("env-1", ep)).toBe("http://localhost:8845");
  });

  it("returns original URL for SSH endpoint with no tunnel", () => {
    const ep = makeSshEndpoint();
    expect(resolveEffectiveUrl("env-1", ep)).toBe("http://my-vm:8845");
  });

  it("returns tunneled localhost URL for SSH endpoint with active tunnel", async () => {
    const ep = makeSshEndpoint();
    await openTunnelForEndpoint("env-1", ep);
    const effectiveUrl = resolveEffectiveUrl("env-1", ep);
    expect(effectiveUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });
});

// ── openTunnelForEndpoint ───────────────────────────────────────────────

describe("openTunnelForEndpoint", () => {
  it("returns null for non-SSH endpoints", async () => {
    const ep = makeDirectEndpoint();
    const port = await openTunnelForEndpoint("env-1", ep);
    expect(port).toBeNull();
  });

  it("returns a local port for valid SSH endpoints", async () => {
    const ep = makeSshEndpoint();
    const port = await openTunnelForEndpoint("env-1", ep);
    expect(port).not.toBeNull();
    expect(port).toBeGreaterThanOrEqual(19000);
    expect(port).toBeLessThanOrEqual(19999);
  });

  it("returns the same port on repeated calls for the same endpoint", async () => {
    const ep = makeSshEndpoint();
    const port1 = await openTunnelForEndpoint("env-1", ep);
    const port2 = await openTunnelForEndpoint("env-1", ep);
    expect(port1).toBe(port2);
  });
});

// ── getTunnelLocalPort ────────────────────────────────────────────────

describe("getTunnelLocalPort", () => {
  it("returns null when no tunnel is registered", () => {
    expect(getTunnelLocalPort("env-x", "ep-x")).toBeNull();
  });

  it("returns the local port after opening a tunnel", async () => {
    const ep = makeSshEndpoint();
    const port = await openTunnelForEndpoint("env-1", ep);
    expect(getTunnelLocalPort("env-1", "ep-1")).toBe(port);
  });
});

// ── closeTunnelForEndpoint ──────────────────────────────────────────────

describe("closeTunnelForEndpoint", () => {
  it("is a no-op when no tunnel exists", () => {
    expect(() => closeTunnelForEndpoint("env-x", "ep-x")).not.toThrow();
  });

  it("closes the tunnel and clears the port lookup", async () => {
    const ep = makeSshEndpoint();
    await openTunnelForEndpoint("env-1", ep);
    expect(getTunnelLocalPort("env-1", "ep-1")).not.toBeNull();

    closeTunnelForEndpoint("env-1", "ep-1");
    expect(getTunnelLocalPort("env-1", "ep-1")).toBeNull();
  });

  it("makes resolveEffectiveUrl fall back to the original URL", async () => {
    const ep = makeSshEndpoint();
    await openTunnelForEndpoint("env-1", ep);
    // Before close: should be tunneled
    expect(resolveEffectiveUrl("env-1", ep)).toMatch(/^http:\/\/127\.0\.0\.1:/);

    closeTunnelForEndpoint("env-1", "ep-1");
    // After close: should fall back to original URL
    expect(resolveEffectiveUrl("env-1", ep)).toBe("http://my-vm:8845");
  });
});

// ── closeTunnelsForEnvironment ──────────────────────────────────────────

describe("closeTunnelsForEnvironment", () => {
  it("closes all tunnels for a given environment", async () => {
    const ep1 = makeSshEndpoint({ id: "ep-1" });
    const ep2 = makeSshEndpoint({ id: "ep-2" });
    await openTunnelForEndpoint("env-1", ep1);
    await openTunnelForEndpoint("env-1", ep2);

    closeTunnelsForEnvironment("env-1");

    expect(getTunnelLocalPort("env-1", "ep-1")).toBeNull();
    expect(getTunnelLocalPort("env-1", "ep-2")).toBeNull();
  });

  it("does not close tunnels for other environments", async () => {
    const ep1 = makeSshEndpoint({ id: "ep-1" });
    const ep2 = makeSshEndpoint({ id: "ep-2" });
    await openTunnelForEndpoint("env-1", ep1);
    await openTunnelForEndpoint("env-2", ep2);

    closeTunnelsForEnvironment("env-1");

    expect(getTunnelLocalPort("env-1", "ep-1")).toBeNull();
    expect(getTunnelLocalPort("env-2", "ep-2")).not.toBeNull();
  });
});

// ── openTunnelsForEnvironment ───────────────────────────────────────────

describe("openTunnelsForEnvironment", () => {
  it("opens tunnels for all SSH endpoints", async () => {
    const ep1 = makeSshEndpoint({ id: "ep-1" });
    const ep2 = makeDirectEndpoint({ id: "ep-2" });
    const ep3 = makeSshEndpoint({ id: "ep-3" });

    await openTunnelsForEnvironment("env-1", [ep1, ep2, ep3], "ep-1");

    expect(getTunnelLocalPort("env-1", "ep-1")).not.toBeNull();
    expect(getTunnelLocalPort("env-1", "ep-2")).toBeNull(); // direct, no tunnel
    expect(getTunnelLocalPort("env-1", "ep-3")).not.toBeNull();
  });

  it("returns the local port for the active endpoint", async () => {
    const ep1 = makeSshEndpoint({ id: "ep-1" });
    const ep2 = makeSshEndpoint({ id: "ep-2" });

    const activePort = await openTunnelsForEnvironment("env-1", [ep1, ep2], "ep-2");

    expect(activePort).toBe(getTunnelLocalPort("env-1", "ep-2"));
  });

  it("returns null when the active endpoint is not SSH", async () => {
    const ep1 = makeDirectEndpoint({ id: "ep-1" });
    const activePort = await openTunnelsForEnvironment("env-1", [ep1], "ep-1");
    expect(activePort).toBeNull();
  });
});

// ── getTunneledEnvironmentIds ───────────────────────────────────────────

describe("getTunneledEnvironmentIds", () => {
  it("returns empty set when no tunnels are active", () => {
    expect(getTunneledEnvironmentIds()).toEqual(new Set());
  });

  it("returns environment IDs that have active tunnels", async () => {
    const ep = makeSshEndpoint();
    await openTunnelForEndpoint("env-1", ep);

    const ids = getTunneledEnvironmentIds();
    expect(ids).toEqual(new Set(["env-1"]));
  });

  it("includes multiple environments", async () => {
    const ep1 = makeSshEndpoint({ id: "ep-1" });
    const ep2 = makeSshEndpoint({ id: "ep-2" });
    await openTunnelForEndpoint("env-1", ep1);
    await openTunnelForEndpoint("env-2", ep2);

    const ids = getTunneledEnvironmentIds();
    expect(ids).toEqual(new Set(["env-1", "env-2"]));
  });
});

// ── closeAllRegistryTunnels ─────────────────────────────────────────────

describe("closeAllRegistryTunnels", () => {
  it("clears all tunnels", async () => {
    const ep1 = makeSshEndpoint({ id: "ep-1" });
    const ep2 = makeSshEndpoint({ id: "ep-2" });
    await openTunnelForEndpoint("env-1", ep1);
    await openTunnelForEndpoint("env-2", ep2);

    closeAllRegistryTunnels();

    expect(getTunnelLocalPort("env-1", "ep-1")).toBeNull();
    expect(getTunnelLocalPort("env-2", "ep-2")).toBeNull();
    expect(getTunneledEnvironmentIds()).toEqual(new Set());
  });
});

// ── Tunnel auto-reconnect ─────────────────────────────────────────────

describe("isTunnelReconnecting", () => {
  it("returns false when no tunnel is registered", () => {
    expect(isTunnelReconnecting("env-x", "ep-x")).toBe(false);
  });

  it("returns false when tunnel is open and not reconnecting", async () => {
    const ep = makeSshEndpoint();
    await openTunnelForEndpoint("env-1", ep);
    expect(isTunnelReconnecting("env-1", "ep-1")).toBe(false);
  });
});

describe("onTunnelReconnect callback", () => {
  it("accepts a callback registration without error", () => {
    const cb = vi.fn();
    expect(() => onTunnelReconnect(cb)).not.toThrow();
  });
});
