import { describe, it, expect } from "vitest";
import { validateInput } from "../../src/visual-evidence/run.js";

describe("cli input validation", () => {
  it("accepts a minimal { changeId } object", () => {
    const r = validateInput({ changeId: "gh-1" });
    expect(r.changeId).toBe("gh-1");
  });

  it("accepts a full input with all optional fields", () => {
    const r = validateInput({
      changeId: "gh-2",
      issue: {
        number: 2,
        title: "T",
        description: "D",
        acceptanceCriteria: ["a"],
      },
      changedFiles: ["a.ts"],
      scenario: { title: "S", steps: ["x"] },
      preferredEvidenceType: "auto",
      expectedStartingState: "cold-open",
      prNumber: 2,
      branchName: "feature/x",
      commitSha: "abc",
    });
    expect(r.changeId).toBe("gh-2");
    expect(r.issue?.acceptanceCriteria).toEqual(["a"]);
    expect(r.preferredEvidenceType).toBe("auto");
  });

  it("rejects empty changeId", () => {
    expect(() => validateInput({ changeId: "" })).toThrow();
  });

  it("rejects missing changeId", () => {
    expect(() => validateInput({})).toThrow();
  });

  it("rejects invalid preferredEvidenceType", () => {
    expect(() =>
      validateInput({ changeId: "x", preferredEvidenceType: "bogus" }),
    ).toThrow();
  });

  it("rejects non-array acceptanceCriteria", () => {
    expect(() =>
      validateInput({
        changeId: "x",
        issue: {
          number: 1,
          title: "t",
          description: "d",
          acceptanceCriteria: "not an array" as any,
        },
      }),
    ).toThrow();
  });

  it("rejects non-positive issue number", () => {
    expect(() =>
      validateInput({
        changeId: "x",
        issue: {
          number: -1,
          title: "t",
          description: "d",
          acceptanceCriteria: [],
        },
      }),
    ).toThrow();
  });

  it("rejects non-number prNumber", () => {
    expect(() =>
      validateInput({ changeId: "x", prNumber: "abc" as any }),
    ).toThrow();
  });

  it("rejects unknown top-level keys (zod strict)", () => {
    expect(() =>
      validateInput({ changeId: "x", bogusField: true } as any),
    ).toThrow();
  });
});
