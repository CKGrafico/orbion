import { describe, it, expect } from "vitest";
import {
  resolveActiveChange,
  readChangeContext,
  listActiveChanges,
  OpenSpecResolutionError,
} from "../../src/visual-evidence/openspec-resolver.js";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../..");

describe("openspec-resolver (real disk)", () => {
  it("lists active changes and excludes archive/", () => {
    const active = listActiveChanges(REPO_ROOT);
    expect(active).toContain("gh-142-bulk-relabel");
    expect(active).toContain("gh-77-cold-open-empty-state");
    // archive/ is not surfaced as a change id
    expect(active).not.toContain("archive");
  });

  it("resolves a known active change id", () => {
    const dir = resolveActiveChange(REPO_ROOT, "gh-142-bulk-relabel");
    expect(dir).toEqual(path.join(REPO_ROOT, "openspec/changes/gh-142-bulk-relabel"));
  });

  it("parses proposal + tasks into ChangeContext", () => {
    const c = readChangeContext(REPO_ROOT, "gh-142-bulk-relabel");
    expect(c.changeId).toBe("gh-142-bulk-relabel");
    expect(c.proposal).toBeTruthy();
    expect(c.tasks).toBeTruthy();
    // Acceptance criteria parsed from the proposal
    expect(c.acceptanceCriteria.length).toBeGreaterThan(0);
    expect(c.acceptanceCriteria.some((a) => /bulk-relabel/i.test(a))).toBe(true);
  });

  it("parses affected files from the archive when present", () => {
    const c = readChangeContext(REPO_ROOT, "gh-142-bulk-relabel");
    expect(c.archive).toBeTruthy();
    expect(c.affectedFiles.length).toBeGreaterThan(0);
    expect(c.affectedFiles).toContain("src/renderer/src/components/InfraChatPanel.tsx");
  });

  it("throws when the change id is already archived", () => {
    expect(() =>
      resolveActiveChange(REPO_ROOT, "2026-07-17-gh-139-edit-issue-via-chat"),
    ).toThrow(OpenSpecResolutionError);
  });

  it("throws on unknown change id", () => {
    expect(() => resolveActiveChange(REPO_ROOT, "does-not-exist-xyz")).toThrow(
      OpenSpecResolutionError,
    );
  });

  it("errors when multiple changes are active and no id is given", () => {
    // There are many active changes in this repo, so an ambiguous exception is expected.
    expect(() => resolveActiveChange(REPO_ROOT)).toThrow(OpenSpecResolutionError);
  });
});
