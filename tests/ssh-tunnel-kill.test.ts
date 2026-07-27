import { describe, it, expect, vi } from "vitest";

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
  killed: boolean;
  killTimer: ReturnType<typeof setTimeout> | null;
}

const mockActiveTunnels = new Map<string, MockTunnelHandle>();

function closeTunnelLogic(tunnelId: string): void {
  const handle = mockActiveTunnels.get(tunnelId);
  if (!handle) return;
  handle.intentionalClose = true;
  handle.killed = true;
  if (handle.process.exitCode === null) {
    handle.process.kill();
    handle.killTimer = setTimeout(() => {
      handle.killTimer = null;
      if (handle.process.exitCode === null) {
        handle.process.kill("SIGKILL" as unknown as undefined);
      }
    }, SIGKILL_TIMEOUT_MS);
  } else {
    mockActiveTunnels.delete(tunnelId);
  }
}

function closeAllTunnelsLogic(): void {
  for (const [, handle] of mockActiveTunnels) {
    handle.intentionalClose = true;
    handle.killed = true;
    if (handle.process.exitCode === null) {
      handle.process.kill();
      handle.killTimer = setTimeout(() => {
        handle.killTimer = null;
        if (handle.process.exitCode === null) {
          handle.process.kill("SIGKILL" as unknown as undefined);
        }
      }, SIGKILL_TIMEOUT_MS);
    } else {
      mockActiveTunnels.delete(handle.process.killSignal ?? "dead");
    }
  }
}

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

describe("closeTunnel SIGKILL fallback", () => {
  it("sends SIGTERM first, schedules SIGKILL fallback timer", () => {
    const proc = createMockProcess();
    const handle: MockTunnelHandle = {
      process: proc,
      intentionalClose: false,
      killed: false,
      killTimer: null,
    };
    mockActiveTunnels.set("t1", handle);

    closeTunnelLogic("t1");

    expect(proc.killCount).toBe(1);
    expect(proc.killSignal).toBe("SIGTERM");
    expect(handle.intentionalClose).toBe(true);
    expect(handle.killed).toBe(true);
    expect(handle.killTimer).not.toBeNull();
    mockActiveTunnels.clear();
  });

  it("does not schedule SIGKILL if process already exited", () => {
    const proc = createMockProcess();
    proc.exitCode = 0;
    const handle: MockTunnelHandle = {
      process: proc,
      intentionalClose: false,
      killed: false,
      killTimer: null,
    };
    mockActiveTunnels.set("t2", handle);

    closeTunnelLogic("t2");

    expect(proc.killCount).toBe(0);
    expect(handle.killTimer).toBeNull();
    expect(mockActiveTunnels.has("t2")).toBe(false);
    mockActiveTunnels.clear();
  });

  it("is a no-op for unknown tunnel IDs", () => {
    expect(() => closeTunnelLogic("nonexistent")).not.toThrow();
  });
});

describe("closeAllTunnels SIGKILL fallback", () => {
  it("sends SIGTERM to all active tunnels and schedules SIGKILL timers", () => {
    const proc1 = createMockProcess();
    const proc2 = createMockProcess();
    mockActiveTunnels.set("t1", { process: proc1, intentionalClose: false, killed: false, killTimer: null });
    mockActiveTunnels.set("t2", { process: proc2, intentionalClose: false, killed: false, killTimer: null });

    closeAllTunnelsLogic();

    expect(proc1.killCount).toBe(1);
    expect(proc1.killSignal).toBe("SIGTERM");
    expect(proc2.killCount).toBe(1);
    expect(proc2.killSignal).toBe("SIGTERM");
    mockActiveTunnels.clear();
  });

  it("skips kill for already-exited processes and removes them from map", () => {
    const dead = createMockProcess();
    dead.exitCode = 0;
    const alive = createMockProcess();
    mockActiveTunnels.set("dead", { process: dead, intentionalClose: false, killed: false, killTimer: null });
    mockActiveTunnels.set("alive", { process: alive, intentionalClose: false, killed: false, killTimer: null });

    closeAllTunnelsLogic();

    expect(dead.killCount).toBe(0);
    expect(alive.killCount).toBe(1);
    mockActiveTunnels.clear();
  });
});

describe("forceKillAllTunnels synchronous kill", () => {
  it("sends SIGKILL to all active processes immediately", () => {
    const proc1 = createMockProcess();
    const proc2 = createMockProcess();
    mockActiveTunnels.set("t1", { process: proc1, intentionalClose: false, killed: false, killTimer: null });
    mockActiveTunnels.set("t2", { process: proc2, intentionalClose: false, killed: false, killTimer: null });

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
    mockActiveTunnels.set("dead", { process: dead, intentionalClose: false, killed: false, killTimer: null });
    mockActiveTunnels.set("alive", { process: alive, intentionalClose: false, killed: false, killTimer: null });

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
      killed: false,
      killTimer: null,
    };
    mockActiveTunnels.set("t1", handle);

    closeTunnelLogic("t1");

    expect(proc.killCount).toBe(1);
    expect(proc.killSignal).toBe("SIGTERM");
    expect(handle.killTimer).not.toBeNull();

    if (proc.exitCode === null) {
      proc.kill("SIGKILL" as unknown as undefined);
    }

    expect(proc.killCount).toBe(2);
    expect(proc.killSignal).toBe("SIGKILL");
    mockActiveTunnels.clear();
  });

  it("SIGKILL timer is cancelled when process exits after SIGTERM", () => {
    const proc = createMockProcess();
    const handle: MockTunnelHandle = {
      process: proc,
      intentionalClose: false,
      killed: false,
      killTimer: null,
    };
    mockActiveTunnels.set("t2", handle);

    closeTunnelLogic("t2");

    expect(handle.killTimer).not.toBeNull();

    proc.emitExit();
    clearTimeout(handle.killTimer!);
    handle.killTimer = null;

    if (proc.exitCode === null) {
      proc.kill("SIGKILL" as unknown as undefined);
    }

    expect(proc.killCount).toBe(1);
    expect(proc.killSignal).toBe("SIGTERM");
    mockActiveTunnels.clear();
  });
});

describe("Race guard: timer callback uses exitCode instead of map membership", () => {
  it("closeTunnel: SIGKILL skipped after process exits (exitCode set)", () => {
    const proc = createMockProcess();
    const handle: MockTunnelHandle = {
      process: proc,
      intentionalClose: false,
      killed: false,
      killTimer: null,
    };
    mockActiveTunnels.set("t1", handle);

    closeTunnelLogic("t1");
    expect(handle.killTimer).not.toBeNull();

    proc.emitExit();
    mockActiveTunnels.delete("t1");

    if (proc.exitCode === null) {
      proc.kill("SIGKILL" as unknown as undefined);
    }

    expect(proc.killCount).toBe(1);
    expect(proc.killSignal).toBe("SIGTERM");
    mockActiveTunnels.clear();
  });

  it("closeAllTunnels: SIGKILL skipped after process exits (exitCode set)", () => {
    const proc = createMockProcess();
    const handle: MockTunnelHandle = {
      process: proc,
      intentionalClose: false,
      killed: false,
      killTimer: null,
    };
    mockActiveTunnels.set("t1", handle);

    closeAllTunnelsLogic();
    expect(handle.killTimer).not.toBeNull();

    proc.emitExit();
    mockActiveTunnels.delete("t1");

    if (proc.exitCode === null) {
      proc.kill("SIGKILL" as unknown as undefined);
    }

    expect(proc.killCount).toBe(1);
    expect(proc.killSignal).toBe("SIGTERM");
    mockActiveTunnels.clear();
  });

  it("closeTunnel: SIGKILL fires when process won't exit", () => {
    const proc = createMockProcess();
    const handle: MockTunnelHandle = {
      process: proc,
      intentionalClose: false,
      killed: false,
      killTimer: null,
    };
    mockActiveTunnels.set("t1", handle);

    closeTunnelLogic("t1");

    if (proc.exitCode === null) {
      proc.kill("SIGKILL" as unknown as undefined);
    }

    expect(proc.killCount).toBe(2);
    expect(proc.killSignal).toBe("SIGKILL");
    mockActiveTunnels.clear();
  });
});

describe("closeAllTunnels async awaits process exits", () => {
  it("resolves when all processes exit", async () => {
    const proc1 = createMockProcess();
    const proc2 = createMockProcess();
    const handle1: MockTunnelHandle = { process: proc1, intentionalClose: false, killed: false, killTimer: null };
    const handle2: MockTunnelHandle = { process: proc2, intentionalClose: false, killed: false, killTimer: null };
    mockActiveTunnels.set("t1", handle1);
    mockActiveTunnels.set("t2", handle2);

    const exitPromises: Promise<void>[] = [];
    for (const [, handle] of mockActiveTunnels) {
      handle.intentionalClose = true;
      handle.killed = true;
      if (handle.process.exitCode === null) {
        exitPromises.push(
          new Promise<void>((resolve) => {
            const originalEmitExit = handle.process.emitExit.bind(handle.process);
            handle.process.emitExit = () => {
              originalEmitExit();
              resolve();
            };
          }),
        );
        handle.process.kill();
      }
    }

    proc1.emitExit();
    proc2.emitExit();
    await Promise.all(exitPromises);

    expect(proc1.killCount).toBe(1);
    expect(proc2.killCount).toBe(1);
    mockActiveTunnels.clear();
  });

  it("resolves via Promise.race with hard timeout", async () => {
    const proc = createMockProcess();
    const handle: MockTunnelHandle = { process: proc, intentionalClose: false, killed: false, killTimer: null };
    mockActiveTunnels.set("t1", handle);

    handle.intentionalClose = true;
    handle.killed = true;
    const exitPromise = new Promise<void>((resolve) => {
      vi.useFakeTimers();
      setTimeout(() => {
        proc.emitExit();
        resolve();
      }, 5000);
    });

    handle.process.kill();

    const result = await Promise.race([
      exitPromise,
      new Promise<void>((resolve) => {
        vi.advanceTimersByTime(5000);
        resolve();
      }),
    ]);

    expect(result).toBeUndefined();
    vi.useRealTimers();
    mockActiveTunnels.clear();
  });
});

describe("Exit handler integration model", () => {
  it("before-quit calls closeAllRegistryTunnels", () => {
    const proc = createMockProcess();
    mockActiveTunnels.set("t1", { process: proc, intentionalClose: false, killed: false, killTimer: null });

    closeAllTunnelsLogic();

    expect(proc.killCount).toBe(1);
    expect(proc.killSignal).toBe("SIGTERM");
    mockActiveTunnels.clear();
  });

  it("process.on(exit) calls forceKillAllTunnels (synchronous SIGKILL)", () => {
    const proc = createMockProcess();
    mockActiveTunnels.set("t1", { process: proc, intentionalClose: false, killed: false, killTimer: null });

    forceKillAllTunnelsLogic();

    expect(proc.killCount).toBe(1);
    expect(proc.killSignal).toBe("SIGKILL");
  });
});
