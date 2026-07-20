/**
 * Pure diff-parsing utilities for the PR review mode diff viewer.
 *
 * Splits a unified diff string into structured file entries and per-file
 * diff sections for rendering. Handles standard `diff` and `git diff`
 * output formats.
 */

import type { DiffFileEntry, BriefingSection } from "../../../../shared/ipc";

// ── Types ─────────────────────────────────────────────────────────────

export interface DiffHunkHeader {
  /** The raw `@@ ... @@` line text. */
  text: string;
  /** Line number in the old file. */
  oldStart: number;
  /** Line number in the new file. */
  newStart: number;
}

export type DiffLineType = "context" | "addition" | "removal" | "hunk-header";

export interface DiffLine {
  type: DiffLineType;
  content: string;
  /** Line number in the old file (for context and removal lines). */
  oldLineNo: number | null;
  /** Line number in the new file (for context and addition lines). */
  newLineNo: number | null;
}

export interface ParsedDiffFile {
  entry: DiffFileEntry;
  lines: DiffLine[];
}

// ── File list parsing ──────────────────────────────────────────────────

/**
 * Parse a unified diff string into file entries with add/remove counts.
 * This is the same logic as the main process parser, but available
 * client-side for pre-parsing cached diffs.
 */
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

// ── Per-file diff parsing ─────────────────────────────────────────────

/**
 * Parse a unified diff section into structured lines with line numbers.
 *
 * Handles:
 * - `@@ -a,b +c,d @@` hunk headers
 * - `+text` additions
 * - `-text` removals
 * - ` text` context
 * - No-newline-at-end-of-file markers
 */
export function parseDiffLines(diff: string): DiffLine[] {
  const result: DiffLine[] = [];
  if (!diff || diff.trim().length === 0) return result;

  const lines = diff.split("\n");
  let oldLineNo = 0;
  let newLineNo = 0;

  for (const line of lines) {
    // Hunk header: @@ -oldStart,count +newStart,count @@
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

    // Skip diff headers (diff --git, ---, +++, index, etc.)
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

    // No newline marker
    if (line === "\\ No newline at end of file") {
      continue;
    }

    // Addition
    if (line.startsWith("+")) {
      result.push({
        type: "addition",
        content: line.slice(1),
        oldLineNo: null,
        newLineNo: newLineNo++,
      });
      continue;
    }

    // Removal
    if (line.startsWith("-")) {
      result.push({
        type: "removal",
        content: line.slice(1),
        oldLineNo: oldLineNo++,
        newLineNo: null,
      });
      continue;
    }

    // Context line (may start with a space or be empty)
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

/**
 * Split a full diff string into per-file sections.
 * Returns a map of file path → raw diff section string.
 */
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

// ── Briefing view utilities ─────────────────────────────────────────────

/** Compute totals across all briefing sections. */
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

/** Format a +N/-M stats string for a briefing section. */
export function formatBriefingStats(additions: number, deletions: number): string {
  return `+${additions}/-${deletions}`;
}
