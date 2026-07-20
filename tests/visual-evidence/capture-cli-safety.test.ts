import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("visual evidence capture CLI safety", () => {
  it("does not stage, commit, or push git changes", () => {
    const source = fs.readFileSync(path.resolve("src/visual-evidence/cli.ts"), "utf8");
    expect(source).not.toContain('["add"');
    expect(source).not.toContain('["commit"');
    expect(source).not.toContain('["push"');
  });
});
