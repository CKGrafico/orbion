import type { LoopMeta, LoopWithOrigin } from "./types.js";
import type { ReachabilityState } from "../../shared/ipc";

export interface SimilarLoopMatch {
  loop: LoopMeta;
  environmentId: string;
  environmentName: string;
  projectName: string;
  score: number;
  matchReasons: string[];
}

const EXTENSIONS = /\.(exe|cmd|bat|sh)(\s|$)/i;

export function normalizeCommand(command: string): string {
  const stripped = command.replace(/^.*[/\\]/, "");
  const noExt = stripped.replace(EXTENSIONS, "$2");
  return noExt.toLowerCase().trim();
}

export function scoreLoopSimilarity(
  proposal: { command: string; interval?: string; projectName?: string },
  candidate: LoopWithOrigin,
): { score: number; matchReasons: string[] } {
  const reasons: string[] = [];

  const proposalNorm = normalizeCommand(proposal.command);
  const candidateNorm = normalizeCommand(candidate.loop.command);

  let commandScore = 0;
  if (proposalNorm === candidateNorm) {
    commandScore = 0.5;
  } else {
    const proposalBase = proposalNorm.split(/\s+/)[0] ?? "";
    const candidateBase = candidateNorm.split(/\s+/)[0] ?? "";
    if (proposalBase.length > 0 && proposalBase === candidateBase) {
      commandScore = 0.25;
    }
  }
  if (commandScore > 0) reasons.push("similarLoops.reason.commandMatch");

  let intervalScore = 0;
  if (proposal.interval && proposal.interval === candidate.loop.intervalHuman) {
    intervalScore = 0.2;
    reasons.push("similarLoops.reason.intervalMatch");
  }

  let projectScore = 0;
  if (
    proposal.projectName &&
    proposal.projectName.toLowerCase() === candidate.projectName.toLowerCase()
  ) {
    projectScore = 0.15;
    reasons.push("similarLoops.reason.projectMatch");
  }

  let descriptionScore = 0;
  const proposalDesc = proposal as { description?: string };
  if (proposalDesc.description && candidate.loop.description) {
    const proposalWords = new Set(proposalDesc.description.toLowerCase().split(/\s+/));
    const candidateWords = new Set(candidate.loop.description.toLowerCase().split(/\s+/));
    if (proposalWords.size > 0 && candidateWords.size > 0) {
      const intersection = Array.from(proposalWords).filter((w) => candidateWords.has(w)).length;
      const union = new Set(Array.from(proposalWords).concat(Array.from(candidateWords))).size;
      descriptionScore = (intersection / union) * 0.15;
    }
  }

  const score = commandScore + intervalScore + projectScore + descriptionScore;
  return { score, matchReasons: reasons };
}

export function computeSimilarLoops(params: {
  proposal: { command: string; interval?: string; projectName?: string };
  fleetLoops: LoopWithOrigin[];
  reachability: Record<string, ReachabilityState>;
  ownEnvironmentId: string;
  maxResults?: number;
  minScore?: number;
}): SimilarLoopMatch[] {
  const {
    proposal,
    fleetLoops,
    reachability,
    ownEnvironmentId,
    maxResults = 3,
    minScore = 0.3,
  } = params;

  const scored: SimilarLoopMatch[] = [];

  for (const candidate of fleetLoops) {
    if (candidate.environmentId === ownEnvironmentId) continue;

    const state = reachability[candidate.environmentId];
    if (state !== "connected") continue;

    const { score, matchReasons } = scoreLoopSimilarity(proposal, candidate);
    if (score < minScore) continue;

    scored.push({
      loop: candidate.loop,
      environmentId: candidate.environmentId,
      environmentName: candidate.environmentName,
      projectName: candidate.projectName,
      score,
      matchReasons,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults);
}
