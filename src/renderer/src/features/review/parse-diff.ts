import type { DiffFileEntry, BriefingSection } from "../../../../shared/ipc";

export interface DiffHunkHeader {
  text: string;
  oldStart: number;
  newStart: number;
}

export type DiffLineType = "context" | "addition" | "removal" | "hunk-header";

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNo: number | null;
  newLineNo: number | null;
}

export interface ParsedDiffFile {
  entry: DiffFileEntry;
  lines: DiffLine[];
}

export function parseDiffFileEntries(diff: string): DiffFileEntry[] {
  const files: DiffFileEntry[] = [];
  if (!diff || diff.trim().length === 0) return files;

  const lines = diff.split("\n");
  let currentPath = "";
  let additions = 0;
  let deletions = 0;
  let isBinary = false;
  const seenPaths = new Set<string>();

  const flushFile = (): void => {
    if (currentPath && !seenPaths.has(currentPath)) {
      seenPaths.add(currentPath);
      files.push({ path: currentPath, additions, deletions, isBinary });
    }
  };

  for (const line of lines) {
    const gitMatch = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (gitMatch) {
      flushFile();
      currentPath = gitMatch[2];
      additions = 0;
      deletions = 0;
      isBinary = false;
      continue;
    }

    if (line.startsWith("Binary files") || line.startsWith("GIT binary patch")) {
      isBinary = true;
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      additions++;
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      deletions++;
    }
  }
  flushFile();

  return files;
}

export function parseDiffLines(diff: string): DiffLine[] {
  const result: DiffLine[] = [];
  if (!diff || diff.trim().length === 0) return result;

  const lines = diff.split("\n");
  let oldLineNo = 0;
  let newLineNo = 0;

  for (const line of lines) {
    const hunkMatch = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line);
    if (hunkMatch) {
      oldLineNo = parseInt(hunkMatch[1], 10);
      newLineNo = parseInt(hunkMatch[2], 10);
      result.push({
        type: "hunk-header",
        content: `@@ -${hunkMatch[1]} +${hunkMatch[2]} @@${hunkMatch[3]}`,
        oldLineNo: null,
        newLineNo: null,
      });
      continue;
    }

    if (
      line.startsWith("diff --git") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("index ") ||
      line.startsWith("old mode") ||
      line.startsWith("new mode") ||
      line.startsWith("similarity index") ||
      line.startsWith("rename from") ||
      line.startsWith("rename to") ||
      line.startsWith("copy from") ||
      line.startsWith("copy to") ||
      line.startsWith("Binary files") ||
      line.startsWith("GIT binary patch")
    ) {
      continue;
    }

    if (line === "\\ No newline at end of file") {
      continue;
    }

    if (line.startsWith("+")) {
      result.push({
        type: "addition",
        content: line.slice(1),
        oldLineNo: null,
        newLineNo: newLineNo++,
      });
      continue;
    }

    if (line.startsWith("-")) {
      result.push({
        type: "removal",
        content: line.slice(1),
        oldLineNo: oldLineNo++,
        newLineNo: null,
      });
      continue;
    }

    if (line.startsWith(" ") || line === "") {
      result.push({
        type: "context",
        content: line.startsWith(" ") ? line.slice(1) : "",
        oldLineNo: oldLineNo++,
        newLineNo: newLineNo++,
      });
    }
  }

  return result;
}

export function splitDiffByFile(diff: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!diff || diff.trim().length === 0) return result;

  const lines = diff.split("\n");
  let currentPath = "";
  let currentSection: string[] = [];

  const flushSection = (): void => {
    if (currentPath && currentSection.length > 0) {
      result.set(currentPath, currentSection.join("\n"));
    }
  };

  for (const line of lines) {
    const gitMatch = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (gitMatch) {
      flushSection();
      currentPath = gitMatch[2];
      currentSection = [line];
      continue;
    }

    if (currentPath) {
      currentSection.push(line);
    }
  }
  flushSection();

  return result;
}

export function getBriefingTotals(
  sections: BriefingSection[],
): { totalFlaggedAdd: number; totalFlaggedDel: number; totalBoilerplateAdd: number; totalBoilerplateDel: number } {
  let totalFlaggedAdd = 0;
  let totalFlaggedDel = 0;
  let totalBoilerplateAdd = 0;
  let totalBoilerplateDel = 0;

  for (const section of sections) {
    if (section.kind === "flagged") {
      for (const file of section.files) {
        totalFlaggedAdd += file.additions;
        totalFlaggedDel += file.deletions;
      }
    } else if (section.kind === "boilerplate" && section.group) {
      totalBoilerplateAdd += section.group.additions;
      totalBoilerplateDel += section.group.deletions;
    }
  }

  return { totalFlaggedAdd, totalFlaggedDel, totalBoilerplateAdd, totalBoilerplateDel };
}

export function formatBriefingStats(additions: number, deletions: number): string {
  return `+${additions}/-${deletions}`;
}
