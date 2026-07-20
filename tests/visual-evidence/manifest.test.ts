import { describe, it, expect } from "vitest";
import { buildManifest } from "../../src/visual-evidence/manifest.js";
import type { RepoCoordinates, EvidenceAsset, AssertionResult, Scenario } from "../../src/visual-evidence/types.js";

const repo: RepoCoordinates = { owner: "CKGrafico", name: "orbion" };
const sha = "abc123sha";
const scenario: Scenario = { title: "Scenario A", steps: ["one", "two"] };
const assertions: AssertionResult[] = [
  { description: "A", status: "passed" },
  { description: "B", status: "failed", error: "boom" },
];
const assets: EvidenceAsset[] = [
  {
    type: "screenshot",
    path: "openspec/changes/gh-x/evidence/final.webp",
    caption: "Final",
    width: 1280,
    height: 720,
    bytes: 100_000,
    format: "webp",
  },
  {
    type: "gif",
    path: "openspec/changes/gh-x/evidence/flow.gif",
    caption: "Flow",
    width: 960,
    height: 540,
    fps: 10,
    durationSeconds: 4.0,
    bytes: 600_000,
    format: "gif",
  },
];

describe("buildManifest", () => {
  it("passed: embeds assets, scenario, assertions, prMarkdown", () => {
    const m: any = buildManifest(
      { changeId: "gh-x", required: true, status: "passed" },
      { repo, sha, scenario, assertions, assets },
    );
    expect(m.version).toBe(1);
    expect(m.changeId).toBe("gh-x");
    expect(m.status).toBe("passed");
    expect((m.assets as any[]).length).toBe(2);
    expect((m.assertions as any[]).length).toBe(2);
    expect(m.scenario.title).toBe("Scenario A");
    expect(typeof m.prMarkdown).toBe("string");
    expect(m.prMarkdown).toContain("## Visual Evidence");
    expect(m.prMarkdown).toContain("raw.githubusercontent.com/CKGrafico/orbion/abc123sha/openspec/changes/gh-x/evidence/final.webp");
  });

  it("skipped: empty assets and empty prMarkdown-equivalent body", () => {
    const m: any = buildManifest(
      { changeId: "gh-y", required: false, status: "skipped" },
      { repo, sha, reason: "No UI changes." },
    );
    expect(m.status).toBe("skipped");
    expect(m.assets).toEqual([]);
    expect(m.reason).toBe("No UI changes.");
    // prMarkdown for skipped contains the reason text but no image embeds
    expect(m.prMarkdown).toContain("No visual evidence required");
    expect(m.prMarkdown).not.toContain("raw.githubusercontent.com");
  });

  it("failed: empty assets + temporaryArtifacts + failedStep + error", () => {
    const m: any = buildManifest(
      { changeId: "gh-z", required: true, status: "failed" },
      {
        repo,
        sha,
        failedStep: "Apply",
        error: "Expected per-item results",
        temporaryArtifacts: {
          screenshot: ".tmp/visual-evidence/gh-z/failure.png",
          video: ".tmp/visual-evidence/gh-z/video.webm",
          trace: ".tmp/visual-evidence/gh-z/trace.zip",
        },
      },
    );
    expect(m.status).toBe("failed");
    expect(m.assets).toEqual([]);
    expect(m.temporaryArtifacts).toBeDefined();
    expect(m.temporaryArtifacts.screenshot).toContain("failure.png");
    expect(m.failedStep).toBe("Apply");
    expect(m.error).toContain("per-item");
    expect(m.prMarkdown).toContain("failed");
    expect(m.prMarkdown).toContain(".tmp/visual-evidence/gh-z/failure.png");
  });

  it("blocked: carries reason", () => {
    const m: any = buildManifest(
      { changeId: "gh-b", required: false, status: "blocked" },
      { repo, sha, reason: "No concrete runner registered." },
    );
    expect(m.status).toBe("blocked");
    expect(m.reason).toContain("runner");
    expect(m.assets).toEqual([]);
  });
});
