import { describe, expect, it } from "vitest";
import { evidenceExitCode } from "../../src/visual-evidence/exit-code.js";
import type { EvidenceResult } from "../../src/visual-evidence/types.js";

describe("evidenceExitCode", () => {
  it("returns 2 for blocked required evidence", () => {
    const result = {
      version: 1,
      changeId: "gh-1-x",
      required: true,
      status: "blocked",
      reason: "missing runner",
      assets: [],
      prMarkdown: "",
    } satisfies EvidenceResult;
    expect(evidenceExitCode(result)).toBe(2);
  });
});
