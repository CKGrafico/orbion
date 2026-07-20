import type { EvidenceResult } from "./types.js";

export function evidenceExitCode(result: EvidenceResult): 0 | 1 | 2 {
  if (result.status === "failed") return 1;
  if (result.status === "blocked") return 2;
  return 0;
}
