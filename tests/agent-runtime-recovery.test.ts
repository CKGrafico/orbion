import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/main/config-store.js", () => ({
  getEnvironments: vi.fn(() => []),
}));

vi.mock("../src/main/logger.js", () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

vi.mock("../src/main/ssh-config.js", () => ({
  buildSshArgs: vi.fn(),
  parseTarget: vi.fn(),
}));

describe("ensureOpenCodeReady", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shares one reachability check for concurrent recovery requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { ensureOpenCodeReady } = await import("../src/main/agent-runtime-recovery.js");

    await Promise.all([
      ensureOpenCodeReady("environment-1", "http://100.99.155.102:13284"),
      ensureOpenCodeReady("environment-1", "http://100.99.155.102:13284"),
    ]);

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
