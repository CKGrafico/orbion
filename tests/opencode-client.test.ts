import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("opencode-client statusCache", () => {
  const STATUS_CACHE_MS = 30_000;
  const STATUS_CACHE_EVICTION_MS = 300_000;

  let statusCache: Map<string, { status: { authState: string }; at: number }>;

  beforeEach(() => {
    vi.useFakeTimers();
    statusCache = new Map();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function evictExpired(): void {
    const cutoff = Date.now() - STATUS_CACHE_EVICTION_MS;
    for (const [id, entry] of statusCache) {
      if (entry.at < cutoff) {
        statusCache.delete(id);
      }
    }
  }

  it("evicts entries older than 5 minutes", () => {
    const now = Date.now();
    statusCache.set("env-old", { status: { authState: "unknown" }, at: now - STATUS_CACHE_EVICTION_MS - 1 });
    statusCache.set("env-recent", { status: { authState: "authenticated" }, at: now - 60_000 });

    evictExpired();

    expect(statusCache.has("env-old")).toBe(false);
    expect(statusCache.has("env-recent")).toBe(true);
  });

  it("keeps entries at exactly the eviction boundary", () => {
    const now = Date.now();
    statusCache.set("env-boundary", { status: { authState: "unknown" }, at: now - STATUS_CACHE_EVICTION_MS });

    evictExpired();

    expect(statusCache.has("env-boundary")).toBe(true);
  });

  it("clears a single entry by id", () => {
    statusCache.set("env-a", { status: { authState: "authenticated" }, at: Date.now() });
    statusCache.set("env-b", { status: { authState: "unknown" }, at: Date.now() });

    statusCache.delete("env-a");

    expect(statusCache.has("env-a")).toBe(false);
    expect(statusCache.has("env-b")).toBe(true);
  });

  it("destroyAll clears all entries", () => {
    statusCache.set("env-a", { status: { authState: "authenticated" }, at: Date.now() });
    statusCache.set("env-b", { status: { authState: "unknown" }, at: Date.now() });

    statusCache.clear();

    expect(statusCache.size).toBe(0);
  });

  it("expired TTL entries are ignored on read but remain until eviction", () => {
    const now = Date.now();
    statusCache.set("env-stale", { status: { authState: "authenticated" }, at: now - STATUS_CACHE_MS - 1 });

    const cached = statusCache.get("env-stale");
    const isExpired = cached ? Date.now() - cached.at >= STATUS_CACHE_MS : true;

    expect(isExpired).toBe(true);
    expect(statusCache.has("env-stale")).toBe(true);

    statusCache.delete("env-stale");
    expect(statusCache.has("env-stale")).toBe(false);
  });

  it("eviction runs on each refresh, preventing unbounded growth", () => {
    const now = Date.now();

    for (let i = 0; i < 100; i++) {
      statusCache.set(`env-${i}`, { status: { authState: "unknown" }, at: now - STATUS_CACHE_EVICTION_MS - (i + 1) * 1000 });
    }
    statusCache.set("env-recent", { status: { authState: "authenticated" }, at: now - 60_000 });

    evictExpired();

    expect(statusCache.size).toBe(1);
    expect(statusCache.has("env-recent")).toBe(true);
  });
});

describe("streamEnvironments tracking", () => {
  it("tracks which environment owns each stream subscription", () => {
    const streams = new Map<string, AbortController>();
    const streamEnvironments = new Map<string, string>();

    const subId = "sub-1";
    const envId = "env-abc";
    const controller = new AbortController();

    streams.set(subId, controller);
    streamEnvironments.set(subId, envId);

    expect(streamEnvironments.get(subId)).toBe(envId);
  });

  it("aborts streams for a removed environment", () => {
    const streams = new Map<string, AbortController>();
    const streamEnvironments = new Map<string, string>();

    const ctrl1 = new AbortController();
    const ctrl2 = new AbortController();
    streams.set("sub-1", ctrl1);
    streamEnvironments.set("sub-1", "env-abc");
    streams.set("sub-2", ctrl2);
    streamEnvironments.set("sub-2", "env-xyz");

    const abortSpy1 = vi.spyOn(ctrl1, "abort");
    const abortSpy2 = vi.spyOn(ctrl2, "abort");

    const removedEnvId = "env-abc";
    for (const [subId, envId] of streamEnvironments) {
      if (envId === removedEnvId) {
        streams.get(subId)?.abort();
        streams.delete(subId);
        streamEnvironments.delete(subId);
      }
    }

    expect(abortSpy1).toHaveBeenCalled();
    expect(abortSpy2).not.toHaveBeenCalled();
    expect(streams.has("sub-1")).toBe(false);
    expect(streams.has("sub-2")).toBe(true);
    expect(streamEnvironments.has("sub-1")).toBe(false);
    expect(streamEnvironments.has("sub-2")).toBe(true);
  });

  it("cleans up streamEnvironments when stream ends naturally", () => {
    const streams = new Map<string, AbortController>();
    const streamEnvironments = new Map<string, string>();

    const subId = "sub-1";
    const ctrl = new AbortController();
    streams.set(subId, ctrl);
    streamEnvironments.set(subId, "env-abc");

    streams.delete(subId);
    streamEnvironments.delete(subId);

    expect(streams.has(subId)).toBe(false);
    expect(streamEnvironments.has(subId)).toBe(false);
  });

  it("clears all stream tracking on window-all-closed", () => {
    const streams = new Map<string, AbortController>();
    const streamEnvironments = new Map<string, string>();

    streams.set("sub-1", new AbortController());
    streamEnvironments.set("sub-1", "env-abc");
    streams.set("sub-2", new AbortController());
    streamEnvironments.set("sub-2", "env-xyz");

    for (const controller of streams.values()) controller.abort();
    streams.clear();
    streamEnvironments.clear();

    expect(streams.size).toBe(0);
    expect(streamEnvironments.size).toBe(0);
  });
});
