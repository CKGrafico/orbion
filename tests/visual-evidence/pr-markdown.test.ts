import { describe, it, expect } from "vitest";
import { generatePrMarkdown, rawImageUrl, resolveRef } from "../../src/visual-evidence/pr-markdown.js";
import type { EvidenceResult, RepoCoordinates } from "../../src/visual-evidence/types.js";

const repo: RepoCoordinates = { owner: "CKGrafico", name: "orbion" };

describe("generatePrMarkdown", () => {
  it("anchored to headSha, not branch, for passed results", () => {
    const r: EvidenceResult = {
      version: 1,
      changeId: "gh-x",
      required: true,
      status: "passed",
      scenario: { title: "Scenario X", steps: ["a", "b"] },
      assertions: [],
      assets: [
        {
          type: "screenshot",
          path: "openspec/changes/gh-x/evidence/final.webp",
          caption: "Final",
          width: 1280,
          height: 720,
          bytes: 100,
          format: "webp",
        },
      ],
      prMarkdown: "",
    } as any;
    const md = generatePrMarkdown(r, repo, "abc123");
    expect(md).toContain("raw.githubusercontent.com/CKGrafico/orbion/abc123/openspec/changes/gh-x/evidence/final.webp");
    expect(md).not.toContain("raw.githubusercontent.com/CKGrafico/orbion/feature/");
  });

  it("uses raw.githubusercontent.com host, not github.com/blob", () => {
    const r: EvidenceResult = {
      version: 1,
      changeId: "gh-x",
      required: true,
      status: "passed",
      scenario: { title: "X", steps: ["a"] },
      assertions: [],
      assets: [
        {
          type: "gif",
          path: "openspec/changes/gh-x/evidence/flow.gif",
          caption: "Flow",
          width: 960,
          height: 540,
          fps: 10,
          durationSeconds: 3,
          bytes: 1,
          format: "gif",
        },
      ],
      prMarkdown: "",
    } as any;
    const md = generatePrMarkdown(r, repo, "sha-x");
    expect(md).toContain("raw.githubusercontent.com/CKGrafico/orbion/sha-x/");
    expect(md).not.toContain("github.com/CKGrafico/orbion/blob/");
  });

  it("contains collapsible details with the scenario steps", () => {
    const r: EvidenceResult = {
      version: 1,
      changeId: "gh-x",
      required: true,
      status: "passed",
      scenario: {
        title: "Validation scenario",
        steps: ["Open the view", "Click Apply", "Verify result"],
      },
      assertions: [],
      assets: [],
      prMarkdown: "",
    } as any;
    const md = generatePrMarkdown(r, repo, "sha");
    expect(md).toContain("<details>");
    expect(md).toContain("<summary>Automated validation scenario</summary>");
    expect(md).toContain("1. Open the view");
    expect(md).toContain("3. Verify result");
  });

  it("uses correct openspec/changes/<id>/evidence/ path in embedded urls", () => {
    const r: EvidenceResult = {
      version: 1,
      changeId: "gh-142-bulk-relabel",
      required: true,
      status: "passed",
      scenario: { title: "X", steps: [] },
      assertions: [],
      assets: [
        {
          type: "screenshot",
          path: "openspec/changes/gh-142-bulk-relabel/evidence/final.webp",
          caption: "Final",
          width: 1, height: 1, bytes: 1, format: "webp",
        },
      ],
      prMarkdown: "",
    } as any;
    const md = generatePrMarkdown(r, repo, "head");
    expect(md).toContain("/openspec/changes/gh-142-bulk-relabel/evidence/final.webp");
  });

  it("contains proper alt text from the asset caption", () => {
    const r: EvidenceResult = {
      version: 1,
      changeId: "x",
      required: true,
      status: "passed",
      scenario: { title: "X", steps: [] },
      assertions: [],
      assets: [
        {
          type: "screenshot",
          path: "openspec/changes/x/evidence/final.webp",
          caption: "Bulk relabel results",
          width: 1, height: 1, bytes: 1, format: "webp",
        },
      ],
      prMarkdown: "",
    } as any;
    const md = generatePrMarkdown(r, repo, "sha");
    expect(md).toContain("![Bulk relabel results](");
  });

  it("skipped produces empty markdown (no image embeds)", () => {
    const r: EvidenceResult = {
      version: 1,
      changeId: "x",
      required: false,
      status: "skipped",
      reason: "Docs only.",
      assets: [],
      prMarkdown: "",
    } as any;
    const md = generatePrMarkdown(r, repo, "sha");
    expect(md).not.toContain("![");
    expect(md.toLowerCase()).not.toContain("raw.githubusercontent.com");
  });
});

describe("rawImageUrl", () => {
  it("builds a url from repo + sha + path", () => {
    const u = rawImageUrl(repo, "abc", "openspec/changes/x/evidence/final.webp");
    expect(u).toBe("https://raw.githubusercontent.com/CKGrafico/orbion/abc/openspec/changes/x/evidence/final.webp");
  });
});

describe("resolveRef", () => {
  it("prefers commitSha over branch when both present", () => {
    expect(resolveRef("feature/x", "sha123")).toBe("sha123");
  });

  it("falls back to branch when no sha", () => {
    expect(resolveRef("feature/x", undefined)).toBe("feature/x");
  });

  it("defaults to main when neither", () => {
    expect(resolveRef(undefined, undefined)).toBe("main");
  });
});
