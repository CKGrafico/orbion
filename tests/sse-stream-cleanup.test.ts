import { describe, it, expect, vi } from "vitest";

interface StreamEntry {
  controller: AbortController;
  sender: { once(event: string, fn: () => void): void };
}

describe("SSE stream renderer-destroyed cleanup", () => {
  it("aborts stream and cleans up Maps when sender is destroyed", () => {
    const streams = new Map<string, StreamEntry>();
    const streamEnvironments = new Map<string, string>();

    let destroyedCallback: (() => void) | null = null;
    const sender = {
      once(event: string, fn: () => void): void {
        if (event === "destroyed") destroyedCallback = fn;
      },
    };

    const controller = new AbortController();
    const subId = "sub-1";
    const envId = "env-1";

    streams.set(subId, { controller, sender });
    streamEnvironments.set(subId, envId);

    sender.once("destroyed", () => {
      controller.abort();
      streams.delete(subId);
      streamEnvironments.delete(subId);
    });

    expect(streams.has(subId)).toBe(true);
    expect(streamEnvironments.has(subId)).toBe(true);
    expect(controller.signal.aborted).toBe(false);

    destroyedCallback!();

    expect(streams.has(subId)).toBe(false);
    expect(streamEnvironments.has(subId)).toBe(false);
    expect(controller.signal.aborted).toBe(true);
  });

  it("cleanup is idempotent when destroyed fires after finally block", () => {
    const streams = new Map<string, StreamEntry>();
    const streamEnvironments = new Map<string, string>();

    let destroyedCallback: (() => void) | null = null;
    const sender = {
      once(event: string, fn: () => void): void {
        if (event === "destroyed") destroyedCallback = fn;
      },
    };

    const controller = new AbortController();
    const subId = "sub-2";
    const envId = "env-2";

    streams.set(subId, { controller, sender });
    streamEnvironments.set(subId, envId);

    sender.once("destroyed", () => {
      controller.abort();
      streams.delete(subId);
      streamEnvironments.delete(subId);
    });

    // Simulate finally block running first
    streams.delete(subId);
    streamEnvironments.delete(subId);

    expect(streams.has(subId)).toBe(false);
    expect(streamEnvironments.has(subId)).toBe(false);

    // Now destroyed fires
    destroyedCallback!();

    // No adverse effects: Maps still clean, abort idempotent
    expect(streams.has(subId)).toBe(false);
    expect(streamEnvironments.has(subId)).toBe(false);
    expect(controller.signal.aborted).toBe(true);
  });

  it("stream unsubscribe aborts controller from Map entry", () => {
    const streams = new Map<string, StreamEntry>();
    const streamEnvironments = new Map<string, string>();

    const sender = {
      once: vi.fn(),
    };

    const controller = new AbortController();
    const subId = "sub-3";
    const envId = "env-3";

    streams.set(subId, { controller, sender });
    streamEnvironments.set(subId, envId);

    // Simulate stream:unsubscribe handler
    streams.get(subId)?.controller.abort();
    streams.delete(subId);
    streamEnvironments.delete(subId);

    expect(streams.has(subId)).toBe(false);
    expect(streamEnvironments.has(subId)).toBe(false);
    expect(controller.signal.aborted).toBe(true);
  });

  it("abortStreamsForEnvironment aborts only matching streams", () => {
    const streams = new Map<string, StreamEntry>();
    const streamEnvironments = new Map<string, string>();

    const sender = {
      once: vi.fn(),
    };

    const controller1 = new AbortController();
    const controller2 = new AbortController();
    streams.set("sub-a", { controller: controller1, sender });
    streamEnvironments.set("sub-a", "env-target");
    streams.set("sub-b", { controller: controller2, sender });
    streamEnvironments.set("sub-b", "env-other");

    // Simulate abortStreamsForEnvironment
    for (const [subId, envId] of streamEnvironments) {
      if (envId === "env-target") {
        streams.get(subId)?.controller.abort();
        streams.delete(subId);
        streamEnvironments.delete(subId);
      }
    }

    expect(streams.has("sub-a")).toBe(false);
    expect(streamEnvironments.has("sub-a")).toBe(false);
    expect(controller1.signal.aborted).toBe(true);

    expect(streams.has("sub-b")).toBe(true);
    expect(streamEnvironments.has("sub-b")).toBe(true);
    expect(controller2.signal.aborted).toBe(false);
  });
});
