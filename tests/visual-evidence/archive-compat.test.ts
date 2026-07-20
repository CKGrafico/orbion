import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { permanentEvidenceDir, writeFinalAssets, clearEvidenceDir } from "../../src/visual-evidence/store.js";
import { evidenceDir } from "../../src/visual-evidence/openspec-resolver.js";
import { DEFAULT_CONFIG } from "../../src/visual-evidence/config.js";

function fakeRepoRoot(): string {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), "ve-archive-"));
  // Mirror the openspec structure the resolver expects
  fs.mkdirSync(path.join(t, "openspec/changes/gh-x"), { recursive: true });
  fs.writeFileSync(path.join(t, "openspec/changes/gh-x/proposal.md"), "# Proposal\n");
  return t;
}

describe("archive compatibility", () => {
  it("evidence folder lives under openspec/changes/<id>/", () => {
    const root = fakeRepoRoot();
    const dir = permanentEvidenceDir(root, "gh-x", DEFAULT_CONFIG);
    expect(dir).toBe(path.join(root, "openspec/changes/gh-x", DEFAULT_CONFIG.evidenceDirectoryName));
  });

  it("writeFinalAssets writes only allowed filenames", () => {
    const root = fakeRepoRoot();
    writeFinalAssets(root, "gh-x", DEFAULT_CONFIG, [
      { filename: "final.webp", buffer: Buffer.from("webp") },
      { filename: "flow.gif", buffer: Buffer.from("gif") },
      { filename: "evidence.json", buffer: Buffer.from("{}") },
    ]);
    const dir = permanentEvidenceDir(root, "gh-x", DEFAULT_CONFIG);
    expect(fs.existsSync(path.join(dir, "final.webp"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "flow.gif"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "evidence.json"))).toBe(true);
  });

  it("refuses to write raw video / traces / frames", () => {
    const root = fakeRepoRoot();
    expect(() =>
      writeFinalAssets(root, "gh-x", DEFAULT_CONFIG, [
        { filename: "video.webm", buffer: Buffer.from("x") },
      ]),
    ).toThrow();
    expect(() =>
      writeFinalAssets(root, "gh-x", DEFAULT_CONFIG, [
        { filename: "trace.zip", buffer: Buffer.from("x") },
      ]),
    ).toThrow();
    expect(() =>
      writeFinalAssets(root, "gh-x", DEFAULT_CONFIG, [
        { filename: "frame-0001.png", buffer: Buffer.from("x") },
      ]),
    ).toThrow();
  });

  it("mv-ing the change folder moves evidence with it (same as the archive skill)", () => {
    const root = fakeRepoRoot();
    writeFinalAssets(root, "gh-x", DEFAULT_CONFIG, [
      { filename: "final.webp", buffer: Buffer.from("data") },
      { filename: "evidence.json", buffer: Buffer.from("{}") },
    ]);

    // Simulate the openspec-archive-change `mv changeRoot -> changes/archive/YYYY-MM-DD-id`
    const archiveDir = path.join(root, "openspec/changes/archive", "2026-07-20-gh-x");
    fs.mkdirSync(path.dirname(archiveDir), { recursive: true });
    fs.renameSync(path.join(root, "openspec/changes/gh-x"), archiveDir);

    // Evidence now lives under the archived folder; no separate copy step needed.
    expect(fs.existsSync(path.join(archiveDir, "evidence/final.webp"))).toBe(true);
    expect(fs.existsSync(path.join(archiveDir, "evidence/evidence.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "openspec/changes/gh-x"))).toBe(false);
  });

  it("clearEvidenceDir removes prior final assets idempotently", () => {
    const root = fakeRepoRoot();
    writeFinalAssets(root, "gh-x", DEFAULT_CONFIG, [
      { filename: "final.webp", buffer: Buffer.from("old") },
    ]);
    clearEvidenceDir(root, "gh-x", DEFAULT_CONFIG);
    const dir = permanentEvidenceDir(root, "gh-x", DEFAULT_CONFIG);
    expect(fs.existsSync(path.join(dir, "final.webp"))).toBe(false);
    // Directory itself remains, ready for the next write.
    expect(fs.existsSync(dir)).toBe(true);
  });

  it("evidenceDir resolves to evidence subfolder under the change", () => {
    const root = fakeRepoRoot();
    const e = evidenceDir(root, "gh-x", "evidence");
    expect(e).toBe(path.join(root, "openspec/changes/gh-x/evidence"));
  });
});
