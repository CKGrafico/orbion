import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConnectionSupervisor, classifyError, isNetworkDownError } from "../src/main/connection-supervisor.js";

async function flushMicrotasks(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

function makeProbeController() {
  let resolveProbe: ((result: { ok: boolean; status: number; error: string | null }) => void) | null = null;
  const probe = vi.fn(async () => {
    return new Promise<{ ok: boolean; status: number; error: string | null }>((resolve) => {
      resolveProbe = resolve;
    });
  });

  const succeed = (status = 200): void => {
    resolveProbe?.({ ok: true, status, error: null });
  };

  const fail = (status: number, error: string | null = null): void => {
    resolveProbe?.({ ok: false, status, error });
  };

  return { probe, succeed, fail };
}

describe("ConnectionSupervisor", () => {
  let onChange: ReturnType<typeof vi.fn>;
  let controller: ReturnType<typeof makeProbeController>;

  beforeEach(() => {
    vi.useFakeTimers();
    onChange = vi.fn();
    controller = makeProbeController();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in offline phase, moves to connecting then connected on success", async () => {
    const supervisor = new ConnectionSupervisor(controller.probe, onChange);
    expect(supervisor.getStatus().phase).toBe("offline");

    supervisor.start();
    await flushMicrotasks();
    expect(supervisor.getStatus().phase).toBe("connecting");
    expect(controller.probe).toHaveBeenCalledTimes(1);

    controller.succeed();
    await flushMicrotasks();
    expect(supervisor.getStatus().phase).toBe("connected");
    supervisor.destroy();
  });

  it("retries with exponential backoff on failure: 1s, 2s, 4s, 8s, 16s cap", async () => {
    const supervisor = new ConnectionSupervisor(controller.probe, onChange);
    supervisor.start();
    await flushMicrotasks();

    const delays = [1000, 2000, 4000, 8000, 16000, 16000];

    for (let i = 0; i < delays.length; i++) {
      controller.fail(500, "Internal Server Error");
      await flushMicrotasks();
      expect(supervisor.getStatus().phase).toBe("backoff");
      expect(supervisor.getStatus().failureCount).toBe(i + 1);
      expect(supervisor.getStatus().backoffMs).toBe(delays[i]);

      await vi.advanceTimersByTimeAsync(delays[i]);
      await flushMicrotasks();
    }

    supervisor.destroy();
  });

  it("resets failure counter after 30s stable connection", async () => {
    const supervisor = new ConnectionSupervisor(controller.probe, onChange);
    supervisor.start();
    await flushMicrotasks();

    controller.fail(500, "Internal Server Error");
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(1000);
    await flushMicrotasks();

    controller.succeed();
    await flushMicrotasks();
    expect(supervisor.getStatus().phase).toBe("connected");
    expect(supervisor.getStatus().failureCount).toBe(0);

    await vi.advanceTimersByTimeAsync(35_000);
    expect(supervisor.getStatus().failureCount).toBe(0);
    expect(supervisor.getStatus().backoffMs).toBe(1000);

    supervisor.destroy();
  });

  it("goes to blocked phase on 401 and stops retrying", async () => {
    const supervisor = new ConnectionSupervisor(controller.probe, onChange);
    supervisor.start();
    await flushMicrotasks();

    controller.fail(401, "Unauthorized");
    await flushMicrotasks();
    expect(supervisor.getStatus().phase).toBe("blocked");
    expect(supervisor.getStatus().lastError).toBe("Unauthorized");

    await vi.advanceTimersByTimeAsync(30_000);
    expect(controller.probe).toHaveBeenCalledTimes(1);

    supervisor.destroy();
  });

  it("goes to offline phase on network-down errors without retry spam", async () => {
    const supervisor = new ConnectionSupervisor(controller.probe, onChange);
    supervisor.start();
    await flushMicrotasks();

    controller.fail(0, "net::ERR_INTERNET_DISCONNECTED");
    await flushMicrotasks();
    expect(supervisor.getStatus().phase).toBe("offline");

    await vi.advanceTimersByTimeAsync(60_000);
    expect(controller.probe).toHaveBeenCalledTimes(1);

    supervisor.destroy();
  });

  it("wakeup skips backoff and retries immediately", async () => {
    const supervisor = new ConnectionSupervisor(controller.probe, onChange);
    supervisor.start();
    await flushMicrotasks();

    controller.fail(500, "Internal Server Error");
    await flushMicrotasks();
    expect(supervisor.getStatus().phase).toBe("backoff");

    supervisor.wakeup();
    await flushMicrotasks();
    expect(supervisor.getStatus().phase).toBe("connecting");
    expect(controller.probe).toHaveBeenCalledTimes(2);

    controller.succeed();
    await flushMicrotasks();
    expect(supervisor.getStatus().phase).toBe("connected");

    supervisor.destroy();
  });

  it("reconnects within one backoff step after daemon restart", async () => {
    const supervisor = new ConnectionSupervisor(controller.probe, onChange);
    supervisor.start();
    await flushMicrotasks();

    controller.fail(500, "Internal Server Error");
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(1000);
    await flushMicrotasks();

    controller.fail(500, "Internal Server Error");
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(500);
    await flushMicrotasks();

    supervisor.wakeup();
    await flushMicrotasks();
    controller.succeed();
    await flushMicrotasks();
    expect(supervisor.getStatus().phase).toBe("connected");

    supervisor.destroy();
  });

  it("setOsOffline(true) parks in offline without consuming retry attempts", async () => {
    const supervisor = new ConnectionSupervisor(controller.probe, onChange);
    supervisor.start();
    await flushMicrotasks();

    controller.fail(500, "Internal Server Error");
    await flushMicrotasks();
    expect(supervisor.getStatus().failureCount).toBe(1);

    supervisor.setOsOffline(true);
    expect(supervisor.getStatus().phase).toBe("offline");

    await vi.advanceTimersByTimeAsync(60_000);
    expect(controller.probe).toHaveBeenCalledTimes(1);

    supervisor.setOsOffline(false);
    await flushMicrotasks();
    expect(controller.probe).toHaveBeenCalledTimes(2);

    controller.succeed();
    await flushMicrotasks();
    expect(supervisor.getStatus().phase).toBe("connected");

    supervisor.destroy();
  });

  it("setOsOffline(true) while connected stays connected", async () => {
    const supervisor = new ConnectionSupervisor(controller.probe, onChange);
    supervisor.start();
    await flushMicrotasks();
    controller.succeed();
    await flushMicrotasks();
    expect(supervisor.getStatus().phase).toBe("connected");

    supervisor.setOsOffline(true);
    expect(supervisor.getStatus().phase).toBe("connected");

    supervisor.destroy();
  });

  it("wakeup does nothing when osOffline is true", async () => {
    const supervisor = new ConnectionSupervisor(controller.probe, onChange);
    supervisor.start();
    await flushMicrotasks();

    controller.fail(500, "Internal Server Error");
    await flushMicrotasks();

    supervisor.setOsOffline(true);
    const callCount = controller.probe.mock.calls.length;

    supervisor.wakeup();
    expect(controller.probe.mock.calls.length).toBe(callCount);

    supervisor.destroy();
  });

  it("wakeup on blocked phase triggers a new probe", async () => {
    const supervisor = new ConnectionSupervisor(controller.probe, onChange);
    supervisor.start();
    await flushMicrotasks();

    controller.fail(401, "Unauthorized");
    await flushMicrotasks();
    expect(supervisor.getStatus().phase).toBe("blocked");

    supervisor.wakeup();
    await flushMicrotasks();
    expect(controller.probe).toHaveBeenCalledTimes(2);

    controller.succeed();
    await flushMicrotasks();
    expect(supervisor.getStatus().phase).toBe("connected");

    supervisor.destroy();
  });

  it("wakeup on offline phase triggers a new probe", async () => {
    const supervisor = new ConnectionSupervisor(controller.probe, onChange);
    supervisor.start();
    await flushMicrotasks();

    controller.fail(0, "net::ERR_INTERNET_DISCONNECTED");
    await flushMicrotasks();
    expect(supervisor.getStatus().phase).toBe("offline");

    supervisor.wakeup();
    await flushMicrotasks();
    expect(controller.probe).toHaveBeenCalledTimes(2);

    controller.succeed();
    await flushMicrotasks();
    expect(supervisor.getStatus().phase).toBe("connected");

    supervisor.destroy();
  });

  it("retry IPC call triggers wakeup", async () => {
    const supervisor = new ConnectionSupervisor(controller.probe, onChange);
    supervisor.start();
    await flushMicrotasks();

    controller.fail(401, "Forbidden");
    await flushMicrotasks();
    expect(supervisor.getStatus().phase).toBe("blocked");

    supervisor.wakeup();
    await flushMicrotasks();

    controller.succeed();
    await flushMicrotasks();
    expect(supervisor.getStatus().phase).toBe("connected");

    supervisor.destroy();
  });
});

describe("classifyError", () => {
  it("classifies 401 as blocking", () => {
    expect(classifyError(401, null)).toBe("blocking");
  });

  it("classifies 403 as blocking", () => {
    expect(classifyError(403, null)).toBe("blocking");
  });

  it("classifies 500 as transient", () => {
    expect(classifyError(500, null)).toBe("transient");
  });

  it("classifies invalid environment url as blocking", () => {
    expect(classifyError(0, "Invalid environment URL: ftp://bad")).toBe("blocking");
  });

  it("classifies unsupported protocol as blocking", () => {
    expect(classifyError(0, "Unsupported protocol")).toBe("blocking");
  });
});

describe("isNetworkDownError", () => {
  it("detects enetunreach", () => {
    expect(isNetworkDownError("connect ENETUNREACH 192.168.1.1:443")).toBe(true);
  });

  it("detects econnrefused", () => {
    expect(isNetworkDownError("connect ECONNREFUSED 127.0.0.1:8845")).toBe(true);
  });

  it("detects net err_internet_disconnected", () => {
    expect(isNetworkDownError("net::ERR_INTERNET_DISCONNECTED")).toBe(true);
  });

  it("detects request timed out", () => {
    expect(isNetworkDownError("Request timed out")).toBe(true);
  });

  it("returns false for auth errors", () => {
    expect(isNetworkDownError("Unauthorized")).toBe(false);
  });

  it("returns false for generic errors", () => {
    expect(isNetworkDownError("Something went wrong")).toBe(false);
  });
});
