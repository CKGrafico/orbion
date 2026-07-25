import { describe, it, expect } from "vitest";
import {
  resolveActiveChange,
  readChangeContext,
  listActiveChanges,
  archivedChangeRoot,
  OpenSpecResolutionError,
} from "../../src/visual-evidence/openspec-resolver.js";
import path from "node:path";
import fs from "node:fs";

const REPO_ROOT = path.resolve(__dirname, "../..");

const ARCHIVED_ID = "gh-142-bulk-relabel";

describe("openspec-resolver (real disk)", () => {
  it("lists active changes and excludes archive/", () => {
    const active = listActiveChanges(REPO_ROOT);
    expect(active).not.toContain("archive");
    for (const id of active) {
      expect(id).not.toMatch(/^\d{4}-\d{2}-\d{2}-/);
    }
  });

  it("resolves an archived change via archivedChangeRoot", () => {
    const dir = archivedChangeRoot(REPO_ROOT, ARCHIVED_ID);
    expect(dir).toBeTruthy();
    expect(fs.existsSync(dir!)).toBe(true);
  });

  it("parses proposal + tasks into ChangeContext for archived change", () => {
    const c = readChangeContext(REPO_ROOT, ARCHIVED_ID, { allowArchived: true });
    expect(c.changeId).toBe(ARCHIVED_ID);
    expect(c.proposal).toBeTruthy();
    expect(c.tasks).toBeTruthy();
    expect(c.acceptanceCriteria.length).toBeGreaterThan(0);
    expect(c.acceptanceCriteria.some((a) => /bulk-relabel/i.test(a))).toBe(true);
  });

  it("parses affected files from the archive when present", () => {
    const c = readChangeContext(REPO_ROOT, ARCHIVED_ID, { allowArchived: true });
    expect(c.archive).toBeTruthy();
    expect(c.affectedFiles.length).toBeGreaterThan(0);
  });

  it("throws when the change id is already archived and allowArchived is false", () => {
    expect(() =>
      resolveActiveChange(REPO_ROOT, ARCHIVED_ID),
    ).toThrow(OpenSpecResolutionError);
  });

  it("throws on unknown change id", () => {
    expect(() => resolveActiveChange(REPO_ROOT, "does-not-exist-xyz")).toThrow(
      OpenSpecResolutionError,
    );
  });

  it("errors when no active changes exist and no id is given", () => {
    const active = listActiveChanges(REPO_ROOT);
    if (active.length === 0) {
      expect(() => resolveActiveChange(REPO_ROOT)).toThrow(OpenSpecResolutionError);
    } else if (active.length > 1) {
      expect(() => resolveActiveChange(REPO_ROOT)).toThrow(OpenSpecResolutionError);
    }
  });
});
