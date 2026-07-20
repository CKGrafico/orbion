/**
 * Local heuristic diff analysis engine for PR risk verdicts.
 *
 * Analyzes a unified diff string and produces a one-line verdict + risk level.
 * The engine is deliberately conservative: it states uncertainty rather than
 * inventing findings it cannot observe.
 */

import type { PrVerdict, BriefingSection, BriefingFileGroup, DiffFileEntry } from "../shared/ipc.js";

// ── Risk pattern heuristics ──────────────────────────────────────────

const HIGH_RISK_PATTERNS: readonly RegExp[] = [
  /(^|[/])auth/i,
  /(^|[/])credential/i,
  /(^|[/])secret/i,
  /(^|[/])password/i,
  /(^|[/])token/i,
  /(^|[/])permission/i,
  /(^|[/])security/i,
  /(^|[/])crypto/i,
  /(^|[/])ssl/i,
  /(^|[/])tls/i,
];

const MEDIUM_RISK_PATTERNS: readonly RegExp[] = [
  /(^|[/])config/i,
  /(^|[/])\.env/i,
  /(^|[/])docker-compose/i,
  /(^|[/])Dockerfile/i,
  /(^|[/])Makefile/i,
  /(^|[/])package\.json$/i,
  /(^|[/])tsconfig/i,
];

const LOCK_FILE_PATTERNS: readonly RegExp[] = [
  /\.lock$/i,
  /(^|[/])pnpm-lock\.yaml$/i,
  /(^|[/])package-lock\.json$/i,
  /(^|[/])yarn\.lock$/i,
];

// ── Thresholds ───────────────────────────────────────────────────────

const UNCERTAIN_LINE_THRESHOLD = 500;
const UNCERTAIN_FILE_THRESHOLD = 20;
const UNCERTAIN_BINARY_THRESHOLD = 3;
const MEDIUM_LINE_THRESHOLD = 50;

// ── Diff parsing ─────────────────────────────────────────────────────

interface DiffSummary {
  linesAdded: number;
  linesRemoved: number;
  filesChanged: number;
  filePaths: string[];
  binaryFiles: number;
}

/**
 * Parse a unified diff string into a structured summary.
 *
 * Recognises standard `diff` and `git diff` headers:
 * - `diff --git a/path b/path`
 * - `--- a/path` / `+++ b/path`
 * - `Binary files ... differ`
 * - `Only in ...` (directory-only entries)
 */
function parseDiff(diff: string): DiffSummary {
  const summary: DiffSummary = {
    linesAdded: 0,
    linesRemoved: 0,
    filesChanged: 0,
    filePaths: [],
    binaryFiles: 0,
  };

  if (!diff || diff.trim().length === 0) {
    return summary;
  }

  const lines = diff.split("\n");
  const seenPaths = new Set<string>();

  for (const line of lines) {
    // git diff header: diff --git a/path b/path
    const gitMatch = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (gitMatch) {
      const path = gitMatch[2];
      if (!seenPaths.has(path)) {
        seenPaths.add(path);
        summary.filePaths.push(path);
        summary.filesChanged++;
      }
      continue;
    }

    // Unified diff header: --- a/path or +++ b/path
    const plusMatch = /^\+\+\+ b\/(.+)$/.exec(line);
    if (plusMatch && plusMatch[1] !== "/dev/null") {
      const path = plusMatch[1];
      if (!seenPaths.has(path)) {
        seenPaths.add(path);
        summary.filePaths.push(path);
        summary.filesChanged++;
      }
      continue;
    }

    // Binary files
    if (line.startsWith("Binary files") || line.startsWith("GIT binary patch")) {
      summary.binaryFiles++;
      continue;
    }

    // Line additions (skip file headers like +++)
    if (line.startsWith("+") && !line.startsWith("+++")) {
      summary.linesAdded++;
      continue;
    }

    // Line removals (skip file headers like ---)
    if (line.startsWith("-") && !line.startsWith("---")) {
      summary.linesRemoved++;
    }
  }

  return summary;
}

/**
 * Check if any file path matches a set of patterns.
 */
function matchesAnyPattern(paths: string[], patterns: readonly RegExp[]): string[] {
  const matched: string[] = [];
  for (const path of paths) {
    for (const pattern of patterns) {
      if (pattern.test(path)) {
        matched.push(path);
        break;
      }
    }
  }
  return matched;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Analyze a PR diff and produce a risk verdict.
 *
 * The analysis is deterministic and grounded in observable diff properties.
 * It explicitly states uncertainty when the diff is too large or contains
 * binary files that prevent full assessment.
 */
export function analyzeDiff(
  _repo: string,
  _prNumber: number,
  diff: string,
): PrVerdict {
  const summary = parseDiff(diff);
  const totalLines = summary.linesAdded + summary.linesRemoved;

  // No diff or empty diff
  if (summary.filesChanged === 0 && totalLines === 0) {
    return {
      verdict: "No diff available, unable to assess risk",
      riskLevel: "uncertain",
    };
  }

  // Uncertain: very large changes
  if (totalLines > UNCERTAIN_LINE_THRESHOLD || summary.filesChanged > UNCERTAIN_FILE_THRESHOLD) {
    return {
      verdict: `Large change (${totalLines} lines across ${summary.filesChanged} file${summary.filesChanged !== 1 ? "s" : ""}), unable to fully assess risk`,
      riskLevel: "uncertain",
    };
  }

  // Uncertain: too many binary files
  if (summary.binaryFiles >= UNCERTAIN_BINARY_THRESHOLD) {
    return {
      verdict: `${summary.binaryFiles} binary files changed, unable to fully assess risk`,
      riskLevel: "uncertain",
    };
  }

  // Check high-risk patterns
  const highRiskFiles = matchesAnyPattern(summary.filePaths, HIGH_RISK_PATTERNS);
  if (highRiskFiles.length > 0) {
    const fileList = highRiskFiles.length <= 2
      ? highRiskFiles.join(", ")
      : `${highRiskFiles[0]}, ${highRiskFiles[1]} +${highRiskFiles.length - 2} more`;
    return {
      verdict: `Touches security-sensitive files (${fileList})`,
      riskLevel: "high",
    };
  }

  // Check medium-risk patterns (including lock files)
  const mediumRiskFiles = matchesAnyPattern(summary.filePaths, MEDIUM_RISK_PATTERNS);
  const lockFiles = matchesAnyPattern(summary.filePaths, LOCK_FILE_PATTERNS);
  const hasMediumPatterns = mediumRiskFiles.length > 0 || lockFiles.length > 0;

  if (totalLines >= MEDIUM_LINE_THRESHOLD || hasMediumPatterns) {
    const parts: string[] = [];
    if (hasMediumPatterns) {
      const allMedium = [...mediumRiskFiles, ...lockFiles];
      const fileList = allMedium.length <= 2
        ? allMedium.join(", ")
        : `${allMedium[0]}, ${allMedium[1]} +${allMedium.length - 2} more`;
      parts.push(`changes to config files (${fileList})`);
    }
    if (totalLines >= MEDIUM_LINE_THRESHOLD) {
      parts.unshift(`${totalLines} lines across ${summary.filesChanged} file${summary.filesChanged !== 1 ? "s" : ""}`);
    }
    return {
      verdict: parts.join(", "),
      riskLevel: "medium",
    };
  }

  // Low risk: small change, no risk patterns
  return {
    verdict: `Small change (${totalLines} line${totalLines !== 1 ? "s" : ""} in ${summary.filesChanged} file${summary.filesChanged !== 1 ? "s" : ""})`,
    riskLevel: "low",
  };
}

// ── Briefing classification ──────────────────────────────────────────

/** Patterns for files that are always boilerplate regardless of content. */
const BOILERPLATE_PATH_PATTERNS: readonly RegExp[] = [
  ...LOCK_FILE_PATTERNS,
  /\.min\.(js|css)$/i,
  /\.map$/i,
  /\.d\.ts$/i,
  /(^|[/])dist\//i,
  /(^|[/])build\//i,
  /(^|[/])\.next\//i,
  /(^|[/])node_modules\//i,
  /(^|[/])coverage\//i,
  /(^|[/])__snapshots__\//i,
];

/** Patterns for generated or auto-formatted files. */
const GENERATED_FILE_PATTERNS: readonly RegExp[] = [
  /\.generated\./i,
  /\.auto\./i,
  /(^|[/])generated\//i,
  /(^|[/])\.eslintrc/i,
  /(^|[/])\.prettierrc/i,
];

/** Check if all additions in a per-file diff section are whitespace-only. */
function isFormattingOnly(lines: string[]): boolean {
  let hasAddition = false;
  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      hasAddition = true;
      const content = line.slice(1);
      // Whitespace-only: empty, spaces, tabs, trailing comma/semicolon/spinner
      if (content.trim().length > 0 && !/^[,;{}[\]()]\s*$/.test(content.trim())) {
        return false;
      }
    }
  }
  return hasAddition;
}

/** Check if all additions/removals in a per-file diff are import/export statements. */
function isImportOnly(lines: string[]): boolean {
  let hasChange = false;
  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      hasChange = true;
      const content = line.slice(1).trim();
      if (!content.startsWith("import ") && !content.startsWith("export ") && !content.startsWith("} from ") && content !== "") {
        return false;
      }
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      hasChange = true;
      const content = line.slice(1).trim();
      if (!content.startsWith("import ") && !content.startsWith("export ") && !content.startsWith("} from ") && content !== "") {
        return false;
      }
    }
  }
  return hasChange;
}

/**
 * Parse a full unified diff into per-file entries with line stats.
 * This is a more detailed version that also returns the raw lines per file
 * for content-based classification.
 */
interface PerFileDiff {
  entry: DiffFileEntry;
  lines: string[];
}

function parseDiffPerFile(diff: string): PerFileDiff[] {
  const files: PerFileDiff[] = [];
  if (!diff || diff.trim().length === 0) return files;

  const lines = diff.split("\n");
  let currentPath = "";
  let additions = 0;
  let deletions = 0;
  let isBinary = false;
  let currentLines: string[] = [];
  const seenPaths = new Set<string>();

  const flushFile = (): void => {
    if (currentPath && !seenPaths.has(currentPath)) {
      seenPaths.add(currentPath);
      files.push({
        entry: { path: currentPath, additions, deletions, isBinary },
        lines: currentLines,
      });
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
      currentLines = [line];
      continue;
    }

    if (currentPath) {
      currentLines.push(line);

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
  }
  flushFile();

  return files;
}

/** Determine the boilerplate group label for a set of classified files. */
function boilerplateLabel(files: DiffFileEntry[]): string {
  const hasLock = files.some((f) => LOCK_FILE_PATTERNS.some((p) => p.test(f.path)));
  const hasFormatting = files.some((f) => {
    // Non-lock, non-generated files classified as boilerplate due to content
    return !LOCK_FILE_PATTERNS.some((p) => p.test(f.path))
      && !GENERATED_FILE_PATTERNS.some((p) => p.test(f.path));
  });

  const parts: string[] = [];
  if (hasFormatting) parts.push("formatting");
  if (hasLock) parts.push("imports & locks");
  return parts.length > 0 ? parts.join(", ") : "other";
}

/**
 * Classify a PR diff into briefing sections: flagged (risky) and boilerplate
 * (formatting, imports, lock files, generated). The briefing derives only
 * from actual diff content using heuristic pattern matching.
 */
/**
 * Parse a unified diff string into file entries with add/remove counts.
 * Convenience wrapper around parseDiffPerFile that returns only the entry stats.
 */
export function parseDiffFiles(diff: string): DiffFileEntry[] {
  return parseDiffPerFile(diff).map((f) => f.entry);
}

export function classifyDiffSections(diff: string): {
  sections: BriefingSection[];
  summary: string;
  totalFlagged: number;
  totalBoilerplate: number;
} {
  const perFile = parseDiffPerFile(diff);

  const flaggedFiles: DiffFileEntry[] = [];
  const boilerplateFiles: DiffFileEntry[] = [];

  for (const file of perFile) {
    const path = file.entry.path;

    // Explicit risk patterns always flag the file
    const isHighRisk = HIGH_RISK_PATTERNS.some((p) => p.test(path));
    const isMediumRisk = MEDIUM_RISK_PATTERNS.some((p) => p.test(path));

    if (isHighRisk || isMediumRisk) {
      flaggedFiles.push(file.entry);
      continue;
    }

    // Explicit boilerplate path patterns (locks, generated, dist)
    const isBoilerplatePath = BOILERPLATE_PATH_PATTERNS.some((p) => p.test(path))
      || GENERATED_FILE_PATTERNS.some((p) => p.test(path));

    if (isBoilerplatePath) {
      boilerplateFiles.push(file.entry);
      continue;
    }

    // Content-based classification for remaining files
    if (isFormattingOnly(file.lines) || isImportOnly(file.lines)) {
      boilerplateFiles.push(file.entry);
      continue;
    }

    // Default: anything not classified as boilerplate is flagged
    flaggedFiles.push(file.entry);
  }

  // Build sections
  const sections: BriefingSection[] = [];

  if (flaggedFiles.length > 0) {
    sections.push({
      kind: "flagged",
      title: flaggedFiles.length === 1 ? "1 flagged file" : `${flaggedFiles.length} flagged files`,
      files: flaggedFiles,
    });
  }

  if (boilerplateFiles.length > 0) {
    const group: BriefingFileGroup = {
      label: boilerplateLabel(boilerplateFiles),
      additions: boilerplateFiles.reduce((s, f) => s + f.additions, 0),
      deletions: boilerplateFiles.reduce((s, f) => s + f.deletions, 0),
      files: boilerplateFiles,
    };
    sections.push({
      kind: "boilerplate",
      title: `${group.additions}/${group.deletions} ${group.label}`,
      files: boilerplateFiles,
      group,
    });
  }

  // Build summary
  const parts: string[] = [];
  if (flaggedFiles.length > 0) {
    const names = flaggedFiles.slice(0, 3).map((f) => f.path.split("/").pop() ?? f.path);
    const suffix = flaggedFiles.length > 3 ? ` +${flaggedFiles.length - 3} more` : "";
    parts.push(`${flaggedFiles.length} flagged: ${names.join(", ")}${suffix}`);
  }
  if (boilerplateFiles.length > 0) {
    const totalAdd = boilerplateFiles.reduce((s, f) => s + f.additions, 0);
    const totalDel = boilerplateFiles.reduce((s, f) => s + f.deletions, 0);
    parts.push(`+${totalAdd}/-${totalDel} ${boilerplateLabel(boilerplateFiles)} collapsed`);
  }

  const summary = parts.length > 0 ? parts.join(". ") : "No changes found";

  return {
    sections,
    summary,
    totalFlagged: flaggedFiles.length,
    totalBoilerplate: boilerplateFiles.length,
  };
}
