import type { LoopMeta } from "../types";

export type FailureCategory =
  | "environment-down"
  | "command-broken"
  | "command-not-found"
  | "permission-denied"
  | "timeout"
  | "dependency-missing"
  | "unknown";

export interface FailureDiagnosis {
  category: FailureCategory;
  summary: string;
  nextStep: string;
  params?: Record<string, string | number>;
  confidence: "high" | "medium" | "low";
}

interface PatternRule {
  pattern: RegExp;
  category: FailureCategory;
  summaryKey: string;
  nextStepKey: string;
  confidence: "high" | "medium" | "low";
}

// First match wins; ordered from most specific to most general.
const PATTERN_RULES: PatternRule[] = [
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
  {
    pattern: /permission\s+denied|EACCES|access\s+denied|operation\s+not\s+permitted|EPERM/i,
    category: "permission-denied",
    summaryKey: "diagnosis.summaryPermissionDenied",
    nextStepKey: "diagnosis.nextStepPermissionDenied",
    confidence: "high",
  },
  {
    pattern: /ENOENT.*node_modules|package.*not\s+found|unable\s+to\s+resolve\s+dependency|dependency\s+not\s+found/i,
    category: "dependency-missing",
    summaryKey: "diagnosis.summaryDependencyMissing",
    nextStepKey: "diagnosis.nextStepDependencyMissing",
    confidence: "medium",
  },
  {
    pattern: /error:|fatal:|failed|exception|panic|abort/i,
    category: "command-broken",
    summaryKey: "diagnosis.summaryCommandError",
    nextStepKey: "diagnosis.nextStepCommandError",
    confidence: "low",
  },
];

function diagnoseFromExitCode(exitCode: number): FailureDiagnosis | null {
  switch (exitCode) {
    case 127:
      return {
        category: "command-not-found",
        summary: "diagnosis.summaryExit127",
        nextStep: "diagnosis.nextStepExit127",
        params: { exitCode },
        confidence: "high",
      };
    case 126:
      return {
        category: "permission-denied",
        summary: "diagnosis.summaryExit126",
        nextStep: "diagnosis.nextStepExit126",
        params: { exitCode },
        confidence: "high",
      };
    case 137:
      return {
        category: "timeout",
        summary: "diagnosis.summaryExit137",
        nextStep: "diagnosis.nextStepExit137",
        params: { exitCode },
        confidence: "medium",
      };
    case 124:
      return {
        category: "timeout",
        summary: "diagnosis.summaryExit124",
        nextStep: "diagnosis.nextStepExit124",
        params: { exitCode },
        confidence: "medium",
      };
    default:
      return null;
  }
}

export function diagnoseFailure(loop: LoopMeta, logTail: string): FailureDiagnosis {
  if (loop.status !== "failed") {
    return {
      category: "unknown",
      summary: "diagnosis.summaryNotFailed",
      nextStep: "diagnosis.nextStepNotFailed",
      confidence: "high",
    };
  }

  const exitCode = loop.lastExitCode ?? 0;
  const lines = logTail.split(/\r?\n/).filter((l) => l.length > 0);

  // 1. Pattern matching (most recent lines first)
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

  // 2. Exit-code heuristics
  const exitDiagnosis = diagnoseFromExitCode(exitCode);
  if (exitDiagnosis) return exitDiagnosis;

  // 3. Fallback
  const command = [loop.command, ...(loop.commandArgs ?? [])].join(" ");
  if (exitCode !== 0 && lines.length === 0) {
    return {
      category: "command-broken",
      summary: "diagnosis.summaryNoOutput",
      nextStep: "diagnosis.nextStepNoOutput",
      params: { exitCode, command },
      confidence: "low",
    };
  }

  return {
    category: "command-broken",
    summary: "diagnosis.summaryGeneric",
    nextStep: "diagnosis.nextStepGeneric",
    params: { exitCode, command },
    confidence: "low",
  };
}

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

export function isEnvironmentDownCategory(category: FailureCategory): boolean {
  return category === "environment-down";
}
