import { describe, it, expect } from "vitest";
import { deriveScenario } from "../../src/visual-evidence/scenario-deriver.js";
import type { ChangeContext, EvidenceInput } from "../../src/visual-evidence/types.js";

function ctx(over: Partial<ChangeContext> = {}): ChangeContext {
  return {
    changeId: "test",
    changeDir: "openspec/changes/test",
    proposal: "",
    tasks: "",
    archive: "",
    acceptanceCriteria: [],
    affectedFiles: [],
    active: true,
    ...over,
  };
}

function input(over: Partial<EvidenceInput> = {}): EvidenceInput {
  return { changeId: "test", ...over };
}

describe("deriveScenario", () => {
  it("prefers explicit scenario over acceptance criteria", () => {
    const d = deriveScenario(
      ctx({ acceptanceCriteria: ["AC1", "AC2"] }),
      input({ scenario: { title: "Explicit", steps: ["a", "b"] } }),
    );
    expect(d.blocked).toBe(false);
    expect(d.source).toBe("explicit input");
    expect(d.scenario?.title).toBe("Explicit");
  });

  it("uses acceptance criteria as the next priority", () => {
    const d = deriveScenario(
      ctx({ acceptanceCriteria: ["Show the dialog", "Submit the form"] }),
      input(),
    );
    expect(d.scenario?.title).toMatch(/acceptance criteria/i);
    expect(d.scenario?.steps.length).toBe(2);
  });

  it("falls back to proposal when no AC", () => {
    const d = deriveScenario(
      ctx({
        proposal:
          "## Solution\n\n1. Open the Issues view.\n2. Filter by label.\n3. Click Apply.",
      }),
      input(),
    );
    expect(d.source).toBe("proposal");
    expect(d.scenario?.steps.length).toBe(3);
  });

  it("falls back to tasks when no proposal", () => {
    const d = deriveScenario(
      ctx({
        tasks:
          "## Task 1: Add types\n\n- [ ] 1.1 Add types <!-- agent: backend.build -->\n- [ ] 1.2 Add validation",
      }),
      input(),
    );
    expect(d.source).toBe("tasks");
    expect(d.scenario?.steps.length).toBeGreaterThan(0);
  });

  it("falls back to issue description when no OpenSpec match", () => {
    const d = deriveScenario(
      ctx(),
      input({
        issue: {
          number: 1,
          title: "Do the thing",
          description: "step one\nstep two",
          acceptanceCriteria: [],
        },
      }),
    );
    expect(d.scenario?.title).toMatch(/issue #1/i);
    expect(d.scenario?.steps.length).toBeGreaterThan(0);
  });

  it("falls back to changed UI files when nothing else", () => {
    const d = deriveScenario(
      ctx(),
      input({ changedFiles: ["src/renderer/src/components/Foo.tsx"] }),
    );
    expect(d.scenario).not.toBeNull();
    expect(d.source).toBe("changed UI files");
  });

  it("blocked when no source yields a scenario", () => {
    const d = deriveScenario(
      ctx({ proposal: "just plain text with no list" }),
      input(),
    );
    expect(d.blocked).toBe(true);
    expect(d.scenario).toBeNull();
    expect(d.reason).toBeTruthy();
  });

  it("does not invent unsupported behavior — blocked when context is empty", () => {
    const d = deriveScenario(ctx(), input());
    expect(d.blocked).toBe(true);
  });
});
