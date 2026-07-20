import { describe, expect, it } from "vitest";
import { validateEvidenceContract, type ScenarioDefinition } from "../../src/visual-evidence/scenario-registry.js";

const runner: ScenarioDefinition["runner"] = async () => ({
  scenario: { title: "x", steps: [] },
  assertions: [],
});

describe("validateEvidenceContract", () => {
  it("rejects a scenario without a contract", () => {
    const result = validateEvidenceContract({ changeId: "gh-1-x", runner }, [], new Set());
    expect(result.valid).toBe(false);
  });

  it("rejects missing assertions and checkpoints", () => {
    const definition: ScenarioDefinition = {
      changeId: "gh-1-x",
      runner,
      evidenceContract: {
        criteria: [{
          id: "criterion",
          description: "Feature works",
          assertionDescriptions: ["Feature result is visible"],
          captureLabels: ["result"],
        }],
      },
    };
    const result = validateEvidenceContract(definition, [], new Set());
    expect(result.errors).toHaveLength(2);
  });

  it("accepts passed assertions with their required checkpoint", () => {
    const description = "Feature result is visible";
    const definition: ScenarioDefinition = {
      changeId: "gh-1-x",
      runner,
      evidenceContract: {
        criteria: [{
          id: "criterion",
          description: "Feature works",
          assertionDescriptions: [description],
          captureLabels: ["result"],
        }],
      },
    };
    const result = validateEvidenceContract(
      definition,
      [{ description, status: "passed" }],
      new Set(["result"]),
    );
    expect(result.valid).toBe(true);
  });
});
