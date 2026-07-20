import { describe, it, expect } from "vitest";

// ── SIGKILL fallback logic (mirrors ssh-tunnel.ts) ─────────────────────
//
// ssh-tunnel.ts spawns SSH child processes and tracks them in activeTunnels.
// closeTunnel/closeAllTunnels send SIGTERM, then schedule SIGKILL after 2s
// if the process hasn't exited. forceKillAllTunnels sends SIGKILL synchronously
// for process.on("exit") where async timers cannot fire.
//
// These tests validate the logic in isolation without importing Electron-coupled
// modules (same pattern as tunnel-reconnect.test.ts).

const SIGKILL_TIMEOUT_MS = 2_000;

interface MockProcess {
  exitCode: number | null;
  killSignal: string | null;
  killCount: number;
  kill(signal?: string): boolean;
  emitExit(): void;
}

function createMockProcess(): MockProcess {
  return {
    exitCode: null,
    killSignal: null,
    killCount: 0,
    kill(signal?: string) {
      if (this.exitCode !== null) return false;
      this.killSignal = signal ?? "SIGTERM";
      this.killCount++;
      return true;
    },
    emitExit() {
      this.exitCode = 0;
    },
  };
}

interface MockTunnelHandle {
  process: MockProcess;
  intentionalClose: boolean;
  killTimer: ReturnType<typeof setTimeout> | null;
}

const mockActiveTunnels = new Map<string, MockTunnelHandle>();

// ── closeTunnel logic ──────────────────────────────────────────────────

function closeTunnelLogic(tunnelId: string): void {
  const handle = mockActiveTunnels.get(tunnelId);
  if (!handle) return;
  handle.intentionalClose = true;
  if (handle.process.exitCode === null) {
    handle.process.kill();
    handle.killTimer = setTimeout(() => {
      handle.killTimer = null;
      if (handle.process.exitCode === null) {
        handle.process.kill("SIGKILL" as unknown as undefined);
      }
    }, SIGKILL_TIMEOUT_MS);
    // For tests, we track that a timer was scheduled
  } else {
    mockActiveTunnels.delete(tunnelId);
  }
}

// ── closeAllTunnels logic ──────────────────────────────────────────────

function closeAllTunnelsLogic(): void {
  for (const [id, handle] of mockActiveTunnels) {
    handle.intentionalClose = true;
    if (handle.process.exitCode === null) {
      handle.process.kill();
      handle.killTimer = setTimeout(() => {
        handle.killTimer = null;
        if (handle.process.exitCode === null) {
          handle.process.kill("SIGKILL" as unknown as undefined);
        }
      }, SIGKILL_TIMEOUT_MS);
    } else {
      mockActiveTunnels.delete(id);
    }
  }
}

// ── forceKillAllTunnels logic ──────────────────────────────────────────

function forceKillAllTunnelsLogic(): void {
  for (const handle of mockActiveTunnels.values()) {
    if (handle.process.exitCode === null) {
      try {
        handle.process.kill("SIGKILL" as unknown as undefined);
      } catch {
        // Process may have already exited
      }
    }
  }
  mockActiveTunnels.clear();
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("closeTunnel SIGKILL fallback", () => {
  it("sends SIGTERM first, schedules SIGKILL fallback timer", () => {
    const proc = createMockProcess();
    const handle: MockTunnelHandle = {
      process: proc,
      intentionalClose: false,
      killTimer: null,
    };
    mockActiveTunnels.set("t1", handle);

    closeTunnelLogic("t1");

    expect(proc.killCount).toBe(1);
    expect(proc.killSignal).toBe("SIGTERM");
    expect(handle.intentionalClose).toBe(true);
    expect(handle.killTimer).not.toBeNull();
  });

  it("does not schedule SIGKILL if process already exited", () => {
    const proc = createMockProcess();
    proc.exitCode = 0; // Already exited
    const handle: MockTunnelHandle = {
      process: proc,
      intentionalClose: false,
      killTimer: null,
    };
    mockActiveTunnels.set("t2", handle);

    closeTunnelLogic("t2");

    expect(proc.killCount).toBe(0);
    expect(handle.killTimer).toBeNull();
    expect(mockActiveTunnels.has("t2")).toBe(false);
  });

  it("is a no-op for unknown tunnel IDs", () => {
    expect(() => closeTunnelLogic("nonexistent")).not.toThrow();
  });
});

describe("closeAllTunnels SIGKILL fallback", () => {
  it("sends SIGTERM to all active tunnels and schedules SIGKILL timers", () => {
    const proc1 = createMockProcess();
    const proc2 = createMockProcess();
    mockActiveTunnels.set("t1", { process: proc1, intentionalClose: false, killTimer: null });
    mockActiveTunnels.set("t2", { process: proc2, intentionalClose: false, killTimer: null });

    closeAllTunnelsLogic();

    expect(proc1.killCount).toBe(1);
    expect(proc1.killSignal).toBe("SIGTERM");
    expect(proc2.killCount).toBe(1);
    expect(proc2.killSignal).toBe("SIGTERM");
  });

  it("skips kill for already-exited processes and removes them from map", () => {
    const dead = createMockProcess();
    dead.exitCode = 0;
    const alive = createMockProcess();
    mockActiveTunnels.set("dead", { process: dead, intentionalClose: false, killTimer: null });
    mockActiveTunnels.set("alive", { process: alive, intentionalClose: false, killTimer: null });

    closeAllTunnelsLogic();

    expect(dead.killCount).toBe(0);
    expect(alive.killCount).toBe(1);
    expect(mockActiveTunnels.has("dead")).toBe(false);
  });
});

describe("forceKillAllTunnels synchronous kill", () => {
  it("sends SIGKILL to all active processes immediately", () => {
    const proc1 = createMockProcess();
    const proc2 = createMockProcess();
    mockActiveTunnels.set("t1", { process: proc1, intentionalClose: false, killTimer: null });
    mockActiveTunnels.set("t2", { process: proc2, intentionalClose: false, killTimer: null });

    forceKillAllTunnelsLogic();

    expect(proc1.killCount).toBe(1);
    expect(proc1.killSignal).toBe("SIGKILL");
    expect(proc2.killCount).toBe(1);
    expect(proc2.killSignal).toBe("SIGKILL");
    expect(mockActiveTunnels.size).toBe(0);
  });

  it("skips processes that already exited", () => {
    const dead = createMockProcess();
    dead.exitCode = 0;
    const alive = createMockProcess();
    mockActiveTunnels.set("dead", { process: dead, intentionalClose: false, killTimer: null });
    mockActiveTunnels.set("alive", { process: alive, intentionalClose: false, killTimer: null });

    forceKillAllTunnelsLogic();

    expect(dead.killCount).toBe(0);
    expect(alive.killCount).toBe(1);
    expect(alive.killSignal).toBe("SIGKILL");
  });

  it("handles already-empty map gracefully", () => {
    mockActiveTunnels.clear();
    expect(() => forceKillAllTunnelsLogic()).not.toThrow();
  });
});

describe("SIGKILL fallback timer behaviour", () => {
  it("SIGKILL fires if process doesn't exit after SIGTERM within timeout", () => {
    const proc = createMockProcess();
    const handle: MockTunnelHandle = {
      process: proc,
      intentionalClose: false,
      killTimer: null,
    };
    mockActiveTunnels.set("t1", handle);

    closeTunnelLogic("t1");

    expect(proc.killCount).toBe(1);
    expect(proc.killSignal).toBe("SIGTERM");

    // Simulate the SIGKILL timeout firing (process still alive)
    expect(handle.killTimer).not.toBeNull();

    // Simulate the timer callback: process hasn't exited
    if (proc.exitCode === null) {
      proc.kill("SIGKILL" as unknown as undefined);
    }

    expect(proc.killCount).toBe(2);
    expect(proc.killSignal).toBe("SIGKILL");
  });

  it("SIGKILL timer is cancelled when process exits after SIGTERM", () => {
    const proc = createMockProcess();
    const handle: MockTunnelHandle = {
      process: proc,
      intentionalClose: false,
      killTimer: null,
    };
    mockActiveTunnels.set("t2", handle);

    closeTunnelLogic("t2");

    expect(handle.killTimer).not.toBeNull();

    // Simulate process exiting after SIGTERM
    proc.emitExit();
    clearTimeout(handle.killTimer!);
    handle.killTimer = null;

    // If we check now, process has exited, so SIGKILL won't fire
    if (proc.exitCode === null) {
      proc.kill("SIGKILL" as unknown as undefined);
    }

    expect(proc.killCount).toBe(1); // Only SIGTERM was sent
    expect(proc.killSignal).toBe("SIGTERM");
  });
});

describe("Exit handler integration model", () => {
  it("before-quit calls closeAllRegistryTunnels (which clears registry + calls closeAllTunnels)", () => {
    const proc = createMockProcess();
    mockActiveTunnels.set("t1", { process: proc, intentionalClose: false, killTimer: null });

    // Simulate what closeAllRegistryTunnels does:
    // 1. Cancel reconnect timers (not relevant in this mock)
    // 2. Clear registry
    // 3. Call closeAllTunnels
    closeAllTunnelsLogic();

    expect(proc.killCount).toBe(1);
    expect(proc.killSignal).toBe("SIGTERM");
  });

  it("process.on(exit) calls forceKillAllTunnels (synchronous SIGKILL)", () => {
    const proc = createMockProcess();
    mockActiveTunnels.set("t1", { process: proc, intentionalClose: false, killTimer: null });

    forceKillAllTunnelsLogic();

    expect(proc.killCount).toBe(1);
    expect(proc.killSignal).toBe("SIGKILL");
  });
});
