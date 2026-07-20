/**
 * Failure diagnosis for failed loops.
 *
 * When a failed loop's card is summoned, the agent produces a short diagnosis
 * and next step in chat. This module contains the pure classification logic
 * that distinguishes "the environment/target is down" from "the command itself
 * is broken" when logs support it.
 *
 * This is a LOCAL heuristic — it does not call an LLM. The agent (running on
 * the VM via MCP) can always supplement this with a deeper analysis. The
 * heuristic provides an immediate, zero-latency first read.
 */

import type { LoopMeta } from "../types";

// ── Diagnosis types ──────────────────────────────────────────────────

/** Broad categories of loop failure. */
export type FailureCategory =
  | "environment-down"
  | "command-broken"
  | "command-not-found"
  | "permission-denied"
  | "timeout"
  | "dependency-missing"
  | "unknown";

/** A structured diagnosis produced for a failed loop. */
export interface FailureDiagnosis {
  /** The broad failure category. */
  category: FailureCategory;
  /** A short human-readable diagnosis (1-2 sentences). */
  summary: string;
  /** A recommended next step. */
  nextStep: string;
  /** Confidence level of the diagnosis. */
  confidence: "high" | "medium" | "low";
}

// ── Classification patterns ─────────────────────────────────────────

interface PatternRule {
  /** Regex to test against each log line (case-insensitive). */
  pattern: RegExp;
  /** Category to assign if matched. */
  category: FailureCategory;
  /** i18n key for the summary. */
  summaryKey: string;
  /** i18n key for the next step. */
  nextStepKey: string;
  /** Confidence of this pattern match. */
  confidence: "high" | "medium" | "low";
}

/**
 * Ordered pattern rules for log-line classification.
 * First match wins; rules are ordered from most specific to most general.
 */
const PATTERN_RULES: PatternRule[] = [
  // ── Environment-down patterns ────────────────────────────────────
  {
    pattern: /connection\s+refused|ECONNREFUSED|connect\s+ECONNREFUSED/i,
    category: "environment-down",
    summaryKey: "diagnosis.summaryConnectionRefused",
    nextStepKey: "diagnosis.nextStepConnectionRefused",
    confidence: "high",
  },
  {
    pattern: /network\s+is\s+unreachable|ENETUNREACH|no\s+route\s+to\s+host|EHOSTUNREACH/i,
    category: "environment-down",
    summaryKey: "diagnosis.summaryNetworkUnreachable",
    nextStepKey: "diagnosis.nextStepNetworkUnreachable",
    confidence: "high",
  },
  {
    pattern: /timed?\s*out|ETIMEDOUT|connection\s+timed?\s*out/i,
    category: "timeout",
    summaryKey: "diagnosis.summaryTimeout",
    nextStepKey: "diagnosis.nextStepTimeout",
    confidence: "medium",
  },
  {
    pattern: /DNS|getaddrinfo|ENOTFOUND|name\s+resolution|name\s+or\s+service\s+not\s+known/i,
    category: "environment-down",
    summaryKey: "diagnosis.summaryDnsFailure",
    nextStepKey: "diagnosis.nextStepDnsFailure",
    confidence: "high",
  },
  {
    pattern: /TLS|SSL|certificate|CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE|self.signed\s+certificate/i,
    category: "environment-down",
    summaryKey: "diagnosis.summaryTlsError",
    nextStepKey: "diagnosis.nextStepTlsError",
    confidence: "medium",
  },

  // ── Command-not-found patterns ───────────────────────────────────
  {
    pattern: /command\s+not\s+found|not\s+recognized\s+as\s+an?\s+(internal|external)|no\s+such\s+file\s+or\s+directory.*(?:bash|sh|cmd)|:\s*not\s+found$/im,
    category: "command-not-found",
    summaryKey: "diagnosis.summaryCommandNotFound",
    nextStepKey: "diagnosis.nextStepCommandNotFound",
    confidence: "high",
  },
  {
    pattern: /cannot\s+find\s+module|module\s+not\s+found|ERR_MODULE_NOT_FOUND|Cannot\s+resolve/i,
    category: "dependency-missing",
    summaryKey: "diagnosis.summaryModuleNotFound",
    nextStepKey: "diagnosis.nextStepModuleNotFound",
    confidence: "high",
  },

  // ── Permission-denied patterns ────────────────────────────────────
  {
    pattern: /permission\s+denied|EACCES|access\s+denied|operation\s+not\s+permitted|EPERM/i,
    category: "permission-denied",
    summaryKey: "diagnosis.summaryPermissionDenied",
    nextStepKey: "diagnosis.nextStepPermissionDenied",
    confidence: "high",
  },

  // ── Dependency-missing patterns ───────────────────────────────────
  {
    pattern: /ENOENT.*node_modules|package.*not\s+found|unable\s+to\s+resolve\s+dependency|dependency\s+not\s+found/i,
    category: "dependency-missing",
    summaryKey: "diagnosis.summaryDependencyMissing",
    nextStepKey: "diagnosis.nextStepDependencyMissing",
    confidence: "medium",
  },

  // ── Generic command failure ──────────────────────────────────────
  {
    pattern: /error:|fatal:|failed|exception|panic|abort/i,
    category: "command-broken",
    summaryKey: "diagnosis.summaryCommandError",
    nextStepKey: "diagnosis.nextStepCommandError",
    confidence: "low",
  },
];

// ── Exit-code heuristics ────────────────────────────────────────────

/**
 * Map certain exit codes to diagnostic suggestions.
 * These are fallback heuristics when no log pattern matches.
 */
function diagnoseFromExitCode(exitCode: number): FailureDiagnosis | null {
  switch (exitCode) {
    case 127:
      return {
        category: "command-not-found",
        summary: "The command or interpreter was not found (exit 127).",
        nextStep: "Verify the command is installed and in the PATH on the target machine.",
        confidence: "high",
      };
    case 126:
      return {
        category: "permission-denied",
        summary: "The command exists but is not executable (exit 126).",
        nextStep: "Check file permissions on the command script or binary.",
        confidence: "high",
      };
    case 137:
      return {
        category: "timeout",
        summary: "The process was killed (likely OOM or manual kill, exit 137).",
        nextStep: "Check system memory usage; the process may have been killed by the OOM killer.",
        confidence: "medium",
      };
    case 124:
      return {
        category: "timeout",
        summary: "The command timed out (exit 124, typical of the `timeout` command).",
        nextStep: "Increase the timeout or investigate why the command is taking too long.",
        confidence: "medium",
      };
    default:
      return null;
  }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Diagnose a failed loop from its log tail and metadata.
 *
 * @param loop The loop metadata (status must be "failed").
 * @param logTail The recent log output (typically last 10-20 lines).
 * @returns A structured diagnosis, or a fallback "unknown" diagnosis.
 */
export function diagnoseFailure(loop: LoopMeta, logTail: string): FailureDiagnosis {
  // Skip if the loop is not actually failed
  if (loop.status !== "failed") {
    return {
      category: "unknown",
      summary: "The loop is not in a failed state.",
      nextStep: "No action needed.",
      confidence: "high",
    };
  }

  const exitCode = loop.lastExitCode ?? 0;
  const lines = logTail.split(/\r?\n/).filter((l) => l.length > 0);

  // 1. Try pattern matching on log lines (most recent lines first)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    for (const rule of PATTERN_RULES) {
      if (rule.pattern.test(line)) {
        return {
          category: rule.category,
          summary: rule.summaryKey,
          nextStep: rule.nextStepKey,
          confidence: rule.confidence,
        };
      }
    }
  }

  // 2. Try exit-code heuristics
  const exitDiagnosis = diagnoseFromExitCode(exitCode);
  if (exitDiagnosis) return exitDiagnosis;

  // 3. Build a fallback diagnosis from what we know
  const command = [loop.command, ...(loop.commandArgs ?? [])].join(" ");
  if (exitCode !== 0 && lines.length === 0) {
    return {
      category: "command-broken",
      summary: `The command exited with code ${exitCode} but produced no output.`,
      nextStep: `Run \`${command}\` manually on the target machine to see the error.`,
      confidence: "low",
    };
  }

  return {
    category: "command-broken",
    summary: `The command exited with code ${exitCode}.`,
    nextStep: `Check the log output above or run \`${command}\` manually for details.`,
    confidence: "low",
  };
}

/**
 * Determine the display category label for a failure category.
 * Maps to i18n keys.
 */
export function categoryLabelKey(category: FailureCategory): string {
  switch (category) {
    case "environment-down":
      return "diagnosis.categoryEnvironmentDown";
    case "command-broken":
      return "diagnosis.categoryCommandBroken";
    case "command-not-found":
      return "diagnosis.categoryCommandNotFound";
    case "permission-denied":
      return "diagnosis.categoryPermissionDenied";
    case "timeout":
      return "diagnosis.categoryTimeout";
    case "dependency-missing":
      return "diagnosis.categoryDependencyMissing";
    case "unknown":
      return "diagnosis.categoryUnknown";
  }
}

/**
 * Whether a failure category indicates the environment/target is down
 * rather than the command being broken.
 */
export function isEnvironmentDownCategory(category: FailureCategory): boolean {
  return category === "environment-down";
}
