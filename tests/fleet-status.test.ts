import { describe, it, expect } from "vitest";
import {
  highestPriority,
  rollUpEnvironmentStatus,
  isNotifiableStatus,
  PRIORITY_ORDER,
  PRIORITY_RANK,
  type FleetItemStatus,
} from "../src/renderer/src/fleet-status";

describe("highestPriority", () => {
  it("returns idle for empty array", () => {
    expect(highestPriority([])).toBe("idle");
  });

  it("returns the single status when only one is given", () => {
    expect(highestPriority(["working"])).toBe("working");
    expect(highestPriority(["failed"])).toBe("failed");
  });

  it("picks pending-approval over all others", () => {
    for (const status of PRIORITY_ORDER) {
      if (status === "pending-approval") continue;
      expect(highestPriority(["pending-approval", status])).toBe("pending-approval");
    }
  });

  it("picks awaiting-input over everything except pending-approval", () => {
    const lower = PRIORITY_ORDER.filter(
      (s) => s !== "pending-approval" && s !== "awaiting-input",
    );
    for (const status of lower) {
      expect(highestPriority(["awaiting-input", status])).toBe("awaiting-input");
    }
    expect(highestPriority(["pending-approval", "awaiting-input"])).toBe("pending-approval");
  });

  it("picks failed over working, completed, idle", () => {
    expect(highestPriority(["failed", "working"])).toBe("failed");
    expect(highestPriority(["failed", "completed"])).toBe("failed");
    expect(highestPriority(["failed", "idle"])).toBe("failed");
  });

  it("picks working over completed and idle", () => {
    expect(highestPriority(["working", "completed"])).toBe("working");
    expect(highestPriority(["working", "idle"])).toBe("working");
  });

  it("picks completed over idle", () => {
    expect(highestPriority(["completed", "idle"])).toBe("completed");
  });

  it("deduplicates correctly", () => {
    expect(highestPriority(["idle", "idle", "idle"])).toBe("idle");
    expect(highestPriority(["working", "working"])).toBe("working");
  });

  it("handles full priority chain", () => {
    const all: FleetItemStatus[] = ["idle", "completed", "working", "failed", "awaiting-input", "pending-approval"];
    expect(highestPriority(all)).toBe("pending-approval");
  });
});

describe("rollUpEnvironmentStatus", () => {
  it("returns idle when no children", () => {
    expect(rollUpEnvironmentStatus([])).toBe("idle");
  });

  it("returns the highest-priority child", () => {
    expect(rollUpEnvironmentStatus(["working", "idle"])).toBe("working");
    expect(rollUpEnvironmentStatus(["idle", "failed", "working"])).toBe("failed");
    expect(rollUpEnvironmentStatus(["completed", "pending-approval"])).toBe("pending-approval");
  });

  it("returns the only child when one item", () => {
    expect(rollUpEnvironmentStatus(["awaiting-input"])).toBe("awaiting-input");
  });
});

describe("isNotifiableStatus", () => {
  it("returns true for pending-approval", () => {
    expect(isNotifiableStatus("pending-approval")).toBe(true);
  });

  it("returns true for awaiting-input", () => {
    expect(isNotifiableStatus("awaiting-input")).toBe(true);
  });

  it("returns true for failed", () => {
    expect(isNotifiableStatus("failed")).toBe(true);
  });

  it("returns false for working", () => {
    expect(isNotifiableStatus("working")).toBe(false);
  });

  it("returns false for completed", () => {
    expect(isNotifiableStatus("completed")).toBe(false);
  });

  it("returns false for idle", () => {
    expect(isNotifiableStatus("idle")).toBe(false);
  });
});

describe("PRIORITY_RANK", () => {
  it("ranks are strictly increasing by PRIORITY_ORDER", () => {
    for (let i = 1; i < PRIORITY_ORDER.length; i++) {
      expect(PRIORITY_RANK[PRIORITY_ORDER[i - 1]]).toBeLessThan(
        PRIORITY_RANK[PRIORITY_ORDER[i]],
      );
    }
  });

  it("every status has a rank", () => {
    for (const status of PRIORITY_ORDER) {
      expect(PRIORITY_RANK[status]).toBeDefined();
    }
  });
});
