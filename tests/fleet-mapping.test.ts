import { describe, it, expect } from "vitest";
import { loopStatusToFleetItem, chatTurnToFleetItem } from "../src/renderer/src/fleet-mapping";

describe("loopStatusToFleetItem", () => {
  it("maps running to working", () => {
    expect(loopStatusToFleetItem("running", null)).toBe("working");
    expect(loopStatusToFleetItem("running", 0)).toBe("working");
  });

  it("maps non-zero exit code to failed regardless of status", () => {
    expect(loopStatusToFleetItem("waiting", 1)).toBe("failed");
    expect(loopStatusToFleetItem("running", 137)).toBe("failed");
    expect(loopStatusToFleetItem("idle", 2)).toBe("failed");
  });

  it("maps stopped to failed", () => {
    expect(loopStatusToFleetItem("stopped", null)).toBe("failed");
  });

  it("maps waiting to idle", () => {
    expect(loopStatusToFleetItem("waiting", null)).toBe("idle");
  });

  it("maps paused to idle", () => {
    expect(loopStatusToFleetItem("paused", null)).toBe("idle");
  });

  it("maps idle to idle", () => {
    expect(loopStatusToFleetItem("idle", null)).toBe("idle");
  });

  it("maps exit code 0 with running as working (not failed)", () => {
    expect(loopStatusToFleetItem("running", 0)).toBe("working");
  });
});

describe("chatTurnToFleetItem", () => {
  it("maps unresolved approval to pending-approval", () => {
    expect(chatTurnToFleetItem({
      finished: false,
      approval: { resolved: false },
      question: null,
      interrupted: false,
    })).toBe("pending-approval");
  });

  it("maps resolved approval as not the primary concern", () => {
    expect(chatTurnToFleetItem({
      finished: false,
      approval: { resolved: true },
      question: null,
      interrupted: false,
    })).toBe("working");
  });

  it("maps unresolved question to awaiting-input", () => {
    expect(chatTurnToFleetItem({
      finished: false,
      approval: null,
      question: { resolved: false },
      interrupted: false,
    })).toBe("awaiting-input");
  });

  it("maps interrupted turn to failed", () => {
    expect(chatTurnToFleetItem({
      finished: true,
      approval: null,
      question: null,
      interrupted: true,
    })).toBe("failed");
  });

  it("maps finished turn to completed", () => {
    expect(chatTurnToFleetItem({
      finished: true,
      approval: null,
      question: null,
      interrupted: false,
    })).toBe("completed");
  });

  it("maps in-progress turn to working", () => {
    expect(chatTurnToFleetItem({
      finished: false,
      approval: null,
      question: null,
      interrupted: false,
    })).toBe("working");
  });

  it("prioritizes approval over question", () => {
    expect(chatTurnToFleetItem({
      finished: false,
      approval: { resolved: false },
      question: { resolved: false },
      interrupted: false,
    })).toBe("pending-approval");
  });
});
