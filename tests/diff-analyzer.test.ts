import { describe, it, expect } from "vitest";
import { analyzeDiff } from "../src/main/diff-analyzer.js";

const REPO = "acme/orbion";
const PR_NUMBER = 42;

describe("analyzeDiff", () => {
  it("returns uncertain for empty diff", () => {
    const result = analyzeDiff(REPO, PR_NUMBER, "");
    expect(result.riskLevel).toBe("uncertain");
    expect(result.verdict).toContain("No diff available");
  });

  it("returns uncertain for whitespace-only diff", () => {
    const result = analyzeDiff(REPO, PR_NUMBER, "   \n\n  \n");
    expect(result.riskLevel).toBe("uncertain");
    expect(result.verdict).toContain("No diff available");
  });

  it("returns low for a small change", () => {
    const diff = [
      "diff --git a/src/hello.ts b/src/hello.ts",
      "index 1234567..abcdefg 100644",
      "--- a/src/hello.ts",
      "+++ b/src/hello.ts",
      "@@ -1,3 +1,4 @@",
      " import { greet } from './greet';",
      "+import { log } from './log';",
      " ",
      " export function main() {",
    ].join("\n");

    const result = analyzeDiff(REPO, PR_NUMBER, diff);
    expect(result.riskLevel).toBe("low");
    expect(result.verdict).toContain("Small change");
    expect(result.verdict).toContain("1 line");
  });

  it("returns medium for changes over 50 lines", () => {
    const lines = [
      "diff --git a/src/large.ts b/src/large.ts",
      "--- a/src/large.ts",
      "+++ b/src/large.ts",
      "@@ -1,3 +1,55 @@",
    ];
    for (let i = 0; i < 52; i++) {
      lines.push(`+const line${i} = ${i};`);
    }

    const result = analyzeDiff(REPO, PR_NUMBER, lines.join("\n"));
    expect(result.riskLevel).toBe("medium");
    expect(result.verdict).toContain("lines across");
  });

  it("returns medium for config file changes", () => {
    const diff = [
      "diff --git a/config/settings.json b/config/settings.json",
      "--- a/config/settings.json",
      "+++ b/config/settings.json",
      "@@ -1,2 +1,3 @@",
      ' {"key": "value"}',
      '+{"newKey": "newValue"}',
    ].join("\n");

    const result = analyzeDiff(REPO, PR_NUMBER, diff);
    expect(result.riskLevel).toBe("medium");
    expect(result.verdict).toContain("config files");
  });

  it("returns medium for lock file changes", () => {
    const diff = [
      "diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml",
      "--- a/pnpm-lock.yaml",
      "+++ b/pnpm-lock.yaml",
      "@@ -1,2 +1,3 @@",
      " lockfileVersion: 9",
      "+  new-dep: 1.0.0",
    ].join("\n");

    const result = analyzeDiff(REPO, PR_NUMBER, diff);
    expect(result.riskLevel).toBe("medium");
    expect(result.verdict).toContain("config files");
  });

  it("returns high for security-sensitive file changes", () => {
    const diff = [
      "diff --git a/src/auth/tokens.ts b/src/auth/tokens.ts",
      "--- a/src/auth/tokens.ts",
      "+++ b/src/auth/tokens.ts",
      "@@ -1,2 +1,3 @@",
      " export const EXPIRY = 3600;",
      "+export const REFRESH_EXPIRY = 86400;",
    ].join("\n");

    const result = analyzeDiff(REPO, PR_NUMBER, diff);
    expect(result.riskLevel).toBe("high");
    expect(result.verdict).toContain("security-sensitive");
    expect(result.verdict).toContain("auth/tokens.ts");
  });

  it("returns high for credential-related changes", () => {
    const diff = [
      "diff --git a/src/credential/vault.ts b/src/credential/vault.ts",
      "--- a/src/credential/vault.ts",
      "+++ b/src/credential/vault.ts",
      "@@ -1,2 +1,3 @@",
      " export class Vault {}",
      "+  public rotate() {}",
    ].join("\n");

    const result = analyzeDiff(REPO, PR_NUMBER, diff);
    expect(result.riskLevel).toBe("high");
    expect(result.verdict).toContain("security-sensitive");
  });

  it("returns uncertain for very large diffs (>500 lines)", () => {
    const lines = [
      "diff --git a/src/massive.ts b/src/massive.ts",
      "--- a/src/massive.ts",
      "+++ b/src/massive.ts",
      "@@ -1,3 +1,550 @@",
    ];
    // 547 additions
    for (let i = 0; i < 547; i++) {
      lines.push(`+const line${i} = ${i};`);
    }

    const result = analyzeDiff(REPO, PR_NUMBER, lines.join("\n"));
    expect(result.riskLevel).toBe("uncertain");
    expect(result.verdict).toContain("Large change");
    expect(result.verdict).toContain("unable to fully assess");
  });

  it("returns uncertain for many files (>20)", () => {
    const lines: string[] = [];
    for (let i = 0; i < 25; i++) {
      lines.push(`diff --git a/src/file${i}.ts b/src/file${i}.ts`);
      lines.push(`--- a/src/file${i}.ts`);
      lines.push(`+++ b/src/file${i}.ts`);
      lines.push(`@@ -1 +1 @@`);
      lines.push(`-old${i}`);
      lines.push(`+new${i}`);
    }

    const result = analyzeDiff(REPO, PR_NUMBER, lines.join("\n"));
    expect(result.riskLevel).toBe("uncertain");
    expect(result.verdict).toContain("Large change");
  });

  it("handles binary files", () => {
    const diff = [
      "diff --git a/assets/logo.png b/assets/logo.png",
      "Binary files a/assets/logo.png and b/assets/logo.png differ",
    ].join("\n");

    const result = analyzeDiff(REPO, PR_NUMBER, diff);
    // Single binary file without other changes -> uncertain or low
    // Let's see: filesChanged=0 (no +++ b/ match for binary), binaryFiles=1
    // Actually, the path is extracted from diff --git header, not +++
    // Let me check: gitMatch should pick up "b/assets/logo.png"
    expect(result.riskLevel).toBe("low");
  });

  it("returns uncertain for many binary files", () => {
    const lines: string[] = [];
    for (let i = 0; i < 3; i++) {
      lines.push(`diff --git a/assets/img${i}.png b/assets/img${i}.png`);
      lines.push("Binary files differ");
    }

    const result = analyzeDiff(REPO, PR_NUMBER, lines.join("\n"));
    expect(result.riskLevel).toBe("uncertain");
    expect(result.verdict).toContain("binary");
  });

  it("truncates high-risk file list when many matches", () => {
    const lines: string[] = [];
    const securityPaths = ["auth/a.ts", "auth/b.ts", "auth/c.ts", "auth/d.ts"];
    for (const path of securityPaths) {
      lines.push(`diff --git a/src/${path} b/src/${path}`);
      lines.push(`--- a/src/${path}`);
      lines.push(`+++ b/src/${path}`);
      lines.push(`@@ -1 +1 @@`);
      lines.push("-old");
      lines.push("+new");
    }

    const result = analyzeDiff(REPO, PR_NUMBER, lines.join("\n"));
    expect(result.riskLevel).toBe("high");
    expect(result.verdict).toContain("+2 more");
  });

  it("counts both additions and removals in total lines", () => {
    const diff = [
      "diff --git a/src/app.ts b/src/app.ts",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -1,5 +1,5 @@",
      "-import { old } from './old';",
      "+import { new } from './new';",
      "-const x = 1;",
      "+const x = 2;",
    ].join("\n");

    const result = analyzeDiff(REPO, PR_NUMBER, diff);
    // 4 lines total (2 added + 2 removed), no risk patterns -> low
    expect(result.riskLevel).toBe("low");
    expect(result.verdict).toContain("4 lines");
  });
});
