import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/main/config-store.js", () => ({
  getEnvironments: vi.fn(() => []),
  decryptValue: vi.fn((v: string) => v),
}));

vi.mock("../src/main/main-window.js", () => ({
  getMainWindow: vi.fn(() => null),
}));

vi.mock("../src/main/i18n.js", () => ({
  msg: vi.fn((key: string, params?: Record<string, string>) => {
    if (params) return `${key} ${JSON.stringify(params)}`;
    return key;
  }),
}));

vi.mock("../src/main/agent-runtime-recovery.js", () => ({
  ensureOpenCodeReady: vi.fn(),
}));

vi.mock("../src/main/logger.js", () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

function toSseStream(events: Array<{ type: string; [k: string]: unknown }>): ReadableStream<Uint8Array> {
  const chunks = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(chunks));
      controller.close();
    },
  });
}

describe("mapSseEvent", () => {
  let mapSseEvent: typeof import("../src/main/agent-client.js").mapSseEvent;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("../src/main/agent-client.js");
    mapSseEvent = (mod as unknown as { mapSseEvent: typeof mapSseEvent }).mapSseEvent;
  });

  it("maps text-delta event", () => {
    const result = mapSseEvent({ type: "text-delta", text: "hello" }, "sess1", "turn1");
    expect(result).toEqual({ kind: "text-delta", chatSessionId: "sess1", turnId: "turn1", text: "hello" });
  });

  it("maps tool-call-start event", () => {
    const result = mapSseEvent({ type: "tool-call-start", toolCallId: "tc1", toolName: "read_file", title: "Read file" }, "sess1", "turn1");
    expect(result).toEqual({ kind: "tool-call-start", chatSessionId: "sess1", turnId: "turn1", toolCallId: "tc1", toolName: "read_file", title: "Read file" });
  });

  it("maps tool-call-start with id fallback", () => {
    const result = mapSseEvent({ type: "tool-call-start", id: "tc-alt", toolName: "bash", title: "Run" }, "s", "t");
    expect(result!.toolCallId).toBe("tc-alt");
  });

  it("maps tool-call-output event", () => {
    const result = mapSseEvent({ type: "tool-call-output", toolCallId: "tc1", output: "result", status: "completed" }, "sess1", "turn1");
    expect(result).toEqual({ kind: "tool-call-output", chatSessionId: "sess1", turnId: "turn1", toolCallId: "tc1", output: "result", status: "completed" });
  });

  it("maps tool-call-output with error status", () => {
    const result = mapSseEvent({ type: "tool-call-output", toolCallId: "tc1", output: "fail", status: "error" }, "s", "t");
    expect(result!.status).toBe("error");
  });

  it("maps turn-finished event", () => {
    const result = mapSseEvent({ type: "turn-finished" }, "sess1", "turn1");
    expect(result).toEqual({ kind: "turn-finished", chatSessionId: "sess1", turnId: "turn1" });
  });

  it("maps turn-error event", () => {
    const result = mapSseEvent({ type: "turn-error", error: "boom" }, "sess1", "turn1");
    expect(result).toEqual({ kind: "turn-error", chatSessionId: "sess1", turnId: "turn1", error: "boom" });
  });

  it("returns null for unknown event type", () => {
    const result = mapSseEvent({ type: "unknown-event" }, "s", "t");
    expect(result).toBeNull();
  });

  it("returns null for empty type", () => {
    const result = mapSseEvent({}, "s", "t");
    expect(result).toBeNull();
  });
});

describe("consumeSseStream", () => {
  let forwarded: Array<Record<string, unknown>>;

  beforeEach(() => {
    forwarded = [];
    vi.resetModules();
  });

  async function getConsumeSseStream(): Promise<typeof import("../src/main/agent-client.js").consumeSseStream> {
    const { getMainWindow } = await import("../src/main/main-window.js");
    const mockWin = {
      isDestroyed: () => false,
      webContents: { send: (_ch: string, event: Record<string, unknown>) => { forwarded.push(event); } },
    };
    (getMainWindow as ReturnType<typeof vi.fn>).mockReturnValue(mockWin);

    const mod = await import("../src/main/agent-client.js");
    return (mod as unknown as { consumeSseStream: typeof import("../src/main/agent-client.js").consumeSseStream }).consumeSseStream;
  }

  it("forwards text-delta events from SSE stream", async () => {
    const consumeSseStream = await getConsumeSseStream();
    const body = toSseStream([
      { type: "text-delta", text: "Hello " },
      { type: "text-delta", text: "world" },
      { type: "turn-finished" },
    ]);
    const controller = new AbortController();

    const result = await consumeSseStream(body, "sess1", "turn1", controller.signal);

    expect(result).toBe("completed");
    expect(forwarded).toEqual([
      { kind: "text-delta", chatSessionId: "sess1", turnId: "turn1", text: "Hello " },
      { kind: "text-delta", chatSessionId: "sess1", turnId: "turn1", text: "world" },
      { kind: "turn-finished", chatSessionId: "sess1", turnId: "turn1" },
    ]);
  });

  it("forwards tool-call events from SSE stream", async () => {
    const consumeSseStream = await getConsumeSseStream();
    const body = toSseStream([
      { type: "tool-call-start", toolCallId: "tc1", toolName: "read", title: "Read" },
      { type: "tool-call-output", toolCallId: "tc1", output: "file content", status: "completed" },
      { type: "turn-finished" },
    ]);
    const controller = new AbortController();

    await consumeSseStream(body, "sess1", "turn1", controller.signal);

    expect(forwarded).toEqual([
      { kind: "tool-call-start", chatSessionId: "sess1", turnId: "turn1", toolCallId: "tc1", toolName: "read", title: "Read" },
      { kind: "tool-call-output", chatSessionId: "sess1", turnId: "turn1", toolCallId: "tc1", output: "file content", status: "completed" },
      { kind: "turn-finished", chatSessionId: "sess1", turnId: "turn1" },
    ]);
  });

  it("emits turn-finished if SSE stream ends without it", async () => {
    const consumeSseStream = await getConsumeSseStream();
    const body = toSseStream([
      { type: "text-delta", text: "partial" },
    ]);
    const controller = new AbortController();

    await consumeSseStream(body, "sess1", "turn1", controller.signal);

    expect(forwarded).toEqual([
      { kind: "text-delta", chatSessionId: "sess1", turnId: "turn1", text: "partial" },
      { kind: "turn-finished", chatSessionId: "sess1", turnId: "turn1" },
    ]);
  });

  it("skips non-data SSE events", async () => {
    const consumeSseStream = await getConsumeSseStream();
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(encoder.encode("event: ping\n\n"));
        ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text-delta", text: "hi" })}\n\n`));
        ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "turn-finished" })}\n\n`));
        ctrl.close();
      },
    });
    const controller = new AbortController();

    await consumeSseStream(body, "sess1", "turn1", controller.signal);

    expect(forwarded).toEqual([
      { kind: "text-delta", chatSessionId: "sess1", turnId: "turn1", text: "hi" },
      { kind: "turn-finished", chatSessionId: "sess1", turnId: "turn1" },
    ]);
  });

  it("skips non-JSON data events", async () => {
    const consumeSseStream = await getConsumeSseStream();
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(encoder.encode("data: not-json\n\n"));
        ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text-delta", text: "ok" })}\n\n`));
        ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "turn-finished" })}\n\n`));
        ctrl.close();
      },
    });
    const controller = new AbortController();

    await consumeSseStream(body, "sess1", "turn1", controller.signal);

    expect(forwarded).toEqual([
      { kind: "text-delta", chatSessionId: "sess1", turnId: "turn1", text: "ok" },
      { kind: "turn-finished", chatSessionId: "sess1", turnId: "turn1" },
    ]);
  });

  it("emits turn-interrupted when signal is already aborted", async () => {
    const consumeSseStream = await getConsumeSseStream();
    const body = toSseStream([
      { type: "text-delta", text: "start" },
    ]);
    const controller = new AbortController();
    controller.abort();

    const result = await consumeSseStream(body, "sess1", "turn1", controller.signal);
    expect(result).toBe("aborted");
    expect(forwarded.some((e) => e.kind === "turn-interrupted")).toBe(true);
  });

  it("forwards turn-error events", async () => {
    const consumeSseStream = await getConsumeSseStream();
    const body = toSseStream([
      { type: "turn-error", error: "rate limited" },
    ]);
    const controller = new AbortController();

    await consumeSseStream(body, "sess1", "turn1", controller.signal);

    expect(forwarded).toEqual([
      { kind: "turn-error", chatSessionId: "sess1", turnId: "turn1", error: "rate limited" },
    ]);
  });
});
