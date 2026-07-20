/**
 * Local heuristic diff analysis engine for PR risk verdicts.
 *
 * Analyzes a unified diff string and produces a one-line verdict + risk level.
 * The engine is deliberately conservative: it states uncertainty rather than
 * inventing findings it cannot observe.
 */

import type { PrVerdict } from "../shared/ipc.js";

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
