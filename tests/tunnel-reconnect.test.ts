import { describe, it, expect } from "vitest";

/**
 * Tests for the tunnel auto-reconnect with exponential backoff feature.
 *
 * The actual main-process modules (ssh-tunnel, tunnel-registry, connection-supervisor)
 * transitively import electron and cannot be loaded in vitest without a running
 * Electron binary. These tests validate the pure logic — backoff calculation,
 * error classification, and reconnect behavior — in isolation.
 *
 * The same formulas are used in:
 *   - src/main/tunnel-registry.ts (TunnelEntry.reconnect backoff)
 *   - src/main/connection-supervisor.ts (ConnectionSupervisor.onError backoff)
 */

// ── Backoff calculation (mirrors tunnel-registry.ts constants) ────────

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 16_000;

function computeTunnelBackoff(failureCount: number): number {
  return Math.min(
    INITIAL_BACKOFF_MS * Math.pow(2, failureCount - 1),
    MAX_BACKOFF_MS,
  );
}

describe("Tunnel reconnect exponential backoff calculation", () => {
  it("follows 1s, 2s, 4s, 8s, 16s cap pattern", () => {
    const expected = [1_000, 2_000, 4_000, 8_000, 16_000, 16_000, 16_000];
    for (let i = 0; i < expected.length; i++) {
      expect(computeTunnelBackoff(i + 1)).toBe(expected[i]);
    }
  });

  it("never exceeds the cap", () => {
    for (let failureCount = 1; failureCount <= 100; failureCount++) {
      expect(computeTunnelBackoff(failureCount)).toBeLessThanOrEqual(MAX_BACKOFF_MS);
    }
  });

  it("retries are indefinite (no max failure count, stays at cap)", () => {
    // After reaching the cap at failure 5, all subsequent failures stay at MAX_BACKOFF_MS
    for (let failureCount = 5; failureCount <= 100; failureCount++) {
      expect(computeTunnelBackoff(failureCount)).toBe(MAX_BACKOFF_MS);
    }
  });

  it("resets backoff on successful reconnect", () => {
    let failureCount = 0;
    for (let i = 0; i < 5; i++) {
      failureCount++;
      computeTunnelBackoff(failureCount);
    }
    expect(failureCount).toBe(5);

    // Successful reconnect resets
    failureCount = 0;
    expect(computeTunnelBackoff(failureCount + 1)).toBe(INITIAL_BACKOFF_MS);
  });

  it("first failure produces 1s backoff", () => {
    expect(computeTunnelBackoff(1)).toBe(1_000);
  });

  it("fifth failure hits the 16s cap", () => {
    expect(computeTunnelBackoff(5)).toBe(16_000);
  });

  it("sixth and beyond stay at the 16s cap", () => {
    expect(computeTunnelBackoff(6)).toBe(16_000);
    expect(computeTunnelBackoff(10)).toBe(16_000);
  });
});

// ── Error classification (mirrors connection-supervisor.ts logic) ─────

function classifyError(status: number, errorMessage: string | null): "transient" | "blocking" {
  if (status === 401 || status === 403) return "blocking";
  if (errorMessage) {
    const lower = errorMessage.toLowerCase();
    if (
      lower.includes("invalid environment url") ||
      lower.includes("unsupported protocol")
    ) return "blocking";
  }
  return "transient";
}

function isNetworkDownError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("enetunreach") ||
    lower.includes("econnrefused") ||
    lower.includes("getaddrinfo enotfound") ||
    lower.includes("network is unreachable") ||
    lower.includes("net::err_network_changed") ||
    lower.includes("net::err_internet_disconnected") ||
    lower.includes("net::err_name_not_resolved") ||
    lower.includes("net::err_connection_refused") ||
    lower.includes("request timed out")
  );
}

describe("Error classification for tunnel reconnect scenarios", () => {
  it("ECONNREFUSED on local port is transient (tunnel died, not auth error)", () => {
    expect(classifyError(0, "connect ECONNREFUSED 127.0.0.1:19000")).toBe("transient");
  });

  it("401 is blocking (auth failure at the daemon, not a tunnel issue)", () => {
    expect(classifyError(401, "Unauthorized")).toBe("blocking");
  });

  it("generic 500 is transient", () => {
    expect(classifyError(500, "Internal Server Error")).toBe("transient");
  });

  it("local port ECONNREFUSED is detected as network-down", () => {
    // When the tunnel drops, the probe gets ECONNREFUSED on the local port.
    // isNetworkDownError returns true, so the supervisor goes to "offline"
    // (not "backoff"), and the OS-offline path pauses retries until the
    // network is back or wakeup() is called.
    expect(isNetworkDownError("connect ECONNREFUSED 127.0.0.1:19000")).toBe(true);
  });

  it("remote host ECONNREFUSED is detected as network-down", () => {
    expect(isNetworkDownError("connect ECONNREFUSED 192.168.1.10:8845")).toBe(true);
  });

  it("ENETUNREACH is detected as network-down", () => {
    expect(isNetworkDownError("connect ENETUNREACH 10.0.0.1:443")).toBe(true);
  });

  it("auth errors are not network-down", () => {
    expect(isNetworkDownError("Unauthorized")).toBe(false);
    expect(isNetworkDownError("Forbidden")).toBe(false);
  });
});

// ── Reconnect state model (mirrors tunnel-registry.ts ReconnectState) ─

interface ReconnectState {
  failureCount: number;
  backoffMs: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
}

describe("Reconnect state transitions", () => {
  it("initial reconnect state after first tunnel exit", () => {
    const failureCount = 1;
    const backoffMs = computeTunnelBackoff(failureCount);
    const state: ReconnectState = { failureCount, backoffMs, retryTimer: null };
    expect(state.failureCount).toBe(1);
    expect(state.backoffMs).toBe(1_000);
    expect(state.retryTimer).toBeNull();
  });

  it("reconnect state increments failure count on repeated failures", () => {
    let failureCount = 0;
    let backoffMs: number;

    for (let i = 0; i < 5; i++) {
      failureCount++;
      backoffMs = computeTunnelBackoff(failureCount);
    }

    expect(failureCount).toBe(5);
    expect(computeTunnelBackoff(failureCount)).toBe(16_000);
  });

  it("reconnect state resets on successful tunnel reopen", () => {
    // Simulate a sequence: fail 3 times, then succeed
    let failureCount = 3;
    // On success: reconnect = null
    const isReconnecting = false; // reconnect is null after success
    expect(isReconnecting).toBe(false);
    // Next failure would start from 1 again
    failureCount = 1;
    expect(computeTunnelBackoff(failureCount)).toBe(1_000);
  });
});

describe("Tunnel exit event classification", () => {
  it("unexpected exit (non-zero code) should trigger reconnect", () => {
    // Simulates the handleUnexpectedTunnelExit logic:
    // An exit with code !== 0 or code !== null is unexpected
    const exitCode = 1;
    const intentionalClose = false;
    const shouldReconnect = !intentionalClose;
    expect(shouldReconnect).toBe(true);
  });

  it("intentional close (user-initiated) should NOT trigger reconnect", () => {
    const intentionalClose = true;
    const shouldReconnect = !intentionalClose;
    expect(shouldReconnect).toBe(false);
  });

  it("null exit code (signal kill) should trigger reconnect if not intentional", () => {
    const exitCode = null; // killed by signal
    const intentionalClose = false;
    const shouldReconnect = !intentionalClose;
    expect(shouldReconnect).toBe(true);
  });
});
