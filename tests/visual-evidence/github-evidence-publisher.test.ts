import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createVerifiedPublication,
  issueNumberFromChangeId,
  upsertEvidenceComment,
  type CommandRunner,
} from "../../src/visual-evidence/github-evidence-publisher.js";

const repo = { owner: "CKGrafico", name: "orbion" } as const;

describe("GitHub evidence publisher", () => {
  it("derives the issue number from the change id", () => {
    expect(issueNumberFromChangeId("gh-142-bulk-relabel")).toBe(142);
  });

  it("uses the asset commit and verifies the remote file before building markdown", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "orbion-evidence-"));
    const evidenceDir = path.join(root, "openspec/changes/gh-142-x/evidence");
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, "01-result.webp"), "image");
    fs.writeFileSync(path.join(evidenceDir, "evidence.json"), JSON.stringify({
      version: 1,
      changeId: "gh-142-x",
      required: true,
      status: "passed",
      scenario: { title: "Real result", steps: [] },
      assertions: [{ description: "Result is visible", status: "passed" }],
      assets: [{
        type: "screenshot",
        path: "openspec/changes/gh-142-x/evidence/01-result.webp",
        caption: "Result",
        width: 1,
        height: 1,
        bytes: 5,
        format: "webp",
      }],
      prMarkdown: "stale",
    }));
    const calls: string[] = [];
    const runner: CommandRunner = (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (command === "git") return "asset-sha";
      return "";
    };
    const publication = createVerifiedPublication(root, "gh-142-x", repo, runner);
    expect(calls[1]).toContain("gh api repos/CKGrafico/orbion/contents/");
    expect(publication.markdown).toContain("/asset-sha/");
    expect(publication.markdown).not.toContain("stale");
  });

  it("updates an existing marked comment instead of creating a duplicate", () => {
    const calls: string[] = [];
    const runner: CommandRunner = (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (args.includes("--paginate")) {
        return JSON.stringify([{ id: 77, body: "<!-- orbion-visual-evidence:gh-142-x -->" }]);
      }
      return "";
    };
    const id = upsertEvidenceComment("/repo", repo, 142, "gh-142-x", "evidence", runner);
    expect(id).toBe(77);
    expect(calls.some((call) => call.includes("--method PATCH"))).toBe(true);
    expect(calls.some((call) => call.includes("--method POST"))).toBe(false);
  });

  it("upgrades a legacy evidence comment for the same change", () => {
    const calls: string[] = [];
    const runner: CommandRunner = (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (args.includes("--paginate")) {
        return JSON.stringify([{ id: 88, body: "## Visual Evidence\nChange gh-142-x" }]);
      }
      return "";
    };
    const id = upsertEvidenceComment("/repo", repo, 142, "gh-142-x", "evidence", runner);
    expect(id).toBe(88);
    expect(calls.some((call) => call.includes("--method PATCH"))).toBe(true);
  });
});
