import { describe, it, expect } from "vitest";
import { decideEvidenceRequired } from "../../src/visual-evidence/evidence-required.js";
import type { ChangeContext } from "../../src/visual-evidence/types.js";

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

describe("decideEvidenceRequired", () => {
  it("requires when changed files include renderer components", () => {
    const d = decideEvidenceRequired(
      ctx({ affectedFiles: ["src/renderer/src/components/InfraChatPanel.tsx"] }),
    );
    expect(d.required).toBe(true);
    expect(d.reason).toMatch(/renderer components|UI/i);
  });

  it("requires when changed files include CSS / theme", () => {
    const d = decideEvidenceRequired(
      ctx({ affectedFiles: ["src/renderer/src/theme.css"] }),
    );
    expect(d.required).toBe(true);
  });

  it("requires for empty-state / modal / form paths", () => {
    const d = decideEvidenceRequired(
      ctx({ affectedFiles: ["src/renderer/src/components/ColdOpen.tsx"] }),
    );
    expect(d.required).toBe(true);
  });

  it("skips when docs-only", () => {
    const d = decideEvidenceRequired(
      ctx({ affectedFiles: ["README.md", "ARCHITECTURE.md"] }),
    );
    expect(d.required).toBe(false);
    expect(d.reason).toMatch(/documentation/);
  });

  it("skips when test-only", () => {
    const d = decideEvidenceRequired(
      ctx({ affectedFiles: ["tests/ipc-validation.test.ts"] }),
    );
    expect(d.required).toBe(false);
  });

  it("skips when main-process / backend-only", () => {
    const d = decideEvidenceRequired(
      ctx({ affectedFiles: ["src/main/http-utils.ts", "src/main/sse-parser.ts"] }),
    );
    expect(d.required).toBe(false);
    expect(d.reason).toMatch(/main process|internal/);
  });

  it("skips when dependency-only", () => {
    const d = decideEvidenceRequired(
      ctx({ affectedFiles: ["package.json", "pnpm-lock.yaml"] }),
    );
    expect(d.required).toBe(false);
    expect(d.reason).toMatch(/dependencies/);
  });

  it("falls back to proposal text when no affected files", () => {
    const d = decideEvidenceRequired(
      ctx({
        proposal:
          "## Solution\n\nAdd a new renderer component for the dialog that lets users edit a loop.",
      }),
    );
    expect(d.required).toBe(true);
    expect(d.reason).toMatch(/UI|proposal/i);
  });

  it("skips via proposal keyword when proposal mentions 'internal refactor'", () => {
    const d = decideEvidenceRequired(
      ctx({ proposal: "Internal refactor of the SSE parser. No user-visible changes." }),
    );
    expect(d.required).toBe(false);
    expect(d.reason).toMatch(/internal|refactor/);
  });

  it("defaults to required when files are mixed/unknown", () => {
    const d = decideEvidenceRequired(
      ctx({ affectedFiles: ["some/unknown/path.xyz"] }),
    );
    expect(d.required).toBe(true);
  });

  it("returns required:false when no context at all", () => {
    const d = decideEvidenceRequired(ctx());
    expect(d.required).toBe(false);
  });
});
