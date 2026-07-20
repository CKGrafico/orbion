import type { LoopShape, PlatformType } from "../../shared/ipc";
import { normalizeCommand } from "./fleet-similarity";

// ── Types ──────────────────────────────────────────────────────────────

/** A single substitution applied during platform adaptation. */
export interface ShapeSubstitution {
  /** The original token that was replaced. */
  from: string;
  /** The replacement token. */
  to: string;
  /** Which field was adapted: "command", "commandArg", or "chainStep.command". */
  field: string;
}

/** The result of adapting a LoopShape for a target platform. */
export interface AdaptedShape {
  /** The adapted command string. */
  command: string;
  /** The adapted command arguments. */
  commandArgs: string[];
  /** The adapted chain steps (commands may be substituted). */
  chainSteps: Array<{
    taskId: string;
    taskName: string;
    command: string;
    commandArgs: string[];
    onSuccessTaskId: string | null;
    onFailureTaskId: string | null;
  }>;
  /** List of substitutions that were applied. */
  substitutions: ShapeSubstitution[];
}

/** Metadata about a shape match, carried into LoopProposalRow.adaptedFrom. */
export interface ShapeAdaptation {
  /** The source loop ID the shape was matched from. */
  loopId: string;
  /** The source environment ID. */
  environmentId: string;
  /** Human-readable environment name. */
  environmentName: string;
  /** The matched loop's description/name. */
  loopDescription: string;
  /** The chain steps from the matched shape (pre-adaptation). */
  chainSteps: AdaptedShape["chainSteps"];
  /** Substitutions applied during adaptation. */
  substitutions: ShapeSubstitution[];
}

// ── Platform substitution rules ────────────────────────────────────────

/**
 * Known substitution pairs between GitHub and Azure DevOps CLI tooling.
 * Each pair maps a token used on one platform to its equivalent on the other.
 */
const PLATFORM_SUBSTITUTIONS: Array<{
  github: string;
  ado: string;
  scope: "command" | "arg" | "url";
}> = [
  // CLI binary name
  { github: "gh", ado: "az", scope: "command" },
  // CLI subcommand equivalents (less reliable, kept conservative)
  { github: "pr create", ado: "repos pr create", scope: "command" },
  { github: "issue create", ado: "boards work-item create", scope: "command" },
  { github: "issue list", ado: "boards work-item list", scope: "command" },
  { github: "issue view", ado: "boards work-item show", scope: "command" },
  // Host URLs
  { github: "github.com", ado: "dev.azure.com", scope: "url" },
  // Arg styles
  { github: "--repo", ado: "--organization", scope: "arg" },
  { github: "--owner", ado: "--organization", scope: "arg" },
];

// ── Matching ───────────────────────────────────────────────────────────

/**
 * Score a candidate shape against the proposal command.
 * Uses the same normalization as fleet-similarity.
 */
function scoreShapeMatch(
  proposalCommand: string,
  shape: LoopShape,
): number {
  const proposalNorm = normalizeCommand(proposalCommand);
  const shapeNorm = normalizeCommand(shape.command);

  if (proposalNorm === shapeNorm) return 0.9;

  const proposalBase = proposalNorm.split(/\s+/)[0] ?? "";
  const shapeBase = shapeNorm.split(/\s+/)[0] ?? "";

  if (proposalBase.length > 0 && proposalBase === shapeBase) return 0.5;

  return 0;
}

export interface ShapeMatchResult {
  shape: LoopShape;
  score: number;
}

/**
 * Find the best matching cached LoopShape for a proposal command.
 * Only matches shapes from *other* environments (cross-instance similarity).
 *
 * @param proposalCommand The raw command from the proposal.
 * @param shapes All cached LoopShapes across the fleet.
 * @param ownEnvironmentId The current environment — excluded from matching.
 * @param minScore Minimum score threshold (default 0.3).
 * @returns The best match, or null if none exceeds the threshold.
 */
export function matchShapeToFleetIntent(
  proposalCommand: string,
  shapes: LoopShape[],
  ownEnvironmentId: string,
  minScore = 0.3,
): ShapeMatchResult | null {
  let bestMatch: ShapeMatchResult | null = null;

  for (const shape of shapes) {
    if (shape.environmentId === ownEnvironmentId) continue;

    const score = scoreShapeMatch(proposalCommand, shape);
    if (score < minScore) continue;

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { shape, score };
    }
  }

  return bestMatch;
}

// ── Platform adaptation ────────────────────────────────────────────────

/**
 * Apply platform-specific substitutions to a single string.
 * Returns the adapted string and list of substitutions applied.
 */
function adaptString(
  input: string,
  fromPlatform: PlatformType,
  toPlatform: PlatformType,
  field: string,
): { result: string; substitutions: ShapeSubstitution[] } {
  if (fromPlatform === toPlatform || fromPlatform === "unknown" || toPlatform === "unknown") {
    return { result: input, substitutions: [] };
  }

  const substitutions: ShapeSubstitution[] = [];
  let result = input;

  for (const rule of PLATFORM_SUBSTITUTIONS) {
    const from = fromPlatform === "github" ? rule.github : rule.ado;
    const to = toPlatform === "github" ? rule.github : rule.ado;

    if (from === to) continue;

    // Use word-boundary-aware replacement for commands, simple substring for URLs
    if (rule.scope === "url") {
      if (result.includes(from)) {
        result = result.split(from).join(to);
        substitutions.push({ from, to, field });
      }
    } else {
      // Match as a standalone word/token
      const regex = new RegExp(`(?<=^|\\s)${escapeRegex(from)}(?=\\s|$)`, "g");
      if (regex.test(result)) {
        result = result.replace(new RegExp(`(?<=^|\\s)${escapeRegex(from)}(?=\\s|$)`, "g"), to);
        substitutions.push({ from, to, field });
      }
    }
  }

  return { result, substitutions };
}

/** Escape special regex characters. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Detect the likely source platform of a command string.
 * Looks for well-known CLI binary names and host URLs.
 */
export function detectCommandPlatform(command: string): PlatformType {
  const lower = command.toLowerCase();

  if (lower.includes("dev.azure.com") || /\baz\s+/.test(lower) || lower.startsWith("az ")) {
    return "ado";
  }
  if (lower.includes("github.com") || /\bgh\s+/.test(lower) || lower.startsWith("gh ")) {
    return "github";
  }

  return "unknown";
}

/**
 * Adapt a cached shape's commands for a target platform.
 *
 * Applies known substitutions (gh↔az, URL host swaps, arg style changes)
 * and returns the adapted shape with a list of all substitutions made.
 *
 * If the source and target platforms are the same, returns the shape unchanged
 * with an empty substitutions list.
 */
export function adaptShapeForPlatform(
  shape: LoopShape,
  targetPlatform: PlatformType,
): AdaptedShape {
  // Detect source platform from the shape's command
  const sourcePlatform = detectCommandPlatform(shape.command);

  // Adapt main command
  const commandResult = adaptString(shape.command, sourcePlatform, targetPlatform, "command");

  // Adapt command args
  const allSubstitutions: ShapeSubstitution[] = [...commandResult.substitutions];
  const adaptedArgs: string[] = shape.commandArgs.map((arg, i) => {
    const r = adaptString(arg, sourcePlatform, targetPlatform, `commandArg[${i}]`);
    allSubstitutions.push(...r.substitutions);
    return r.result;
  });

  // Adapt chain step commands
  const adaptedChainSteps = shape.chainSteps.map((step) => {
    const stepCmdResult = adaptString(step.command, sourcePlatform, targetPlatform, "chainStep.command");
    allSubstitutions.push(...stepCmdResult.substitutions);

    const stepArgs = step.commandArgs.map((arg, i) => {
      const r = adaptString(arg, sourcePlatform, targetPlatform, `chainStep.commandArg[${i}]`);
      allSubstitutions.push(...r.substitutions);
      return r.result;
    });

    return {
      taskId: step.taskId,
      taskName: step.taskName,
      command: stepCmdResult.result,
      commandArgs: stepArgs,
      onSuccessTaskId: step.onSuccessTaskId,
      onFailureTaskId: step.onFailureTaskId,
    };
  });

  return {
    command: commandResult.result,
    commandArgs: adaptedArgs,
    chainSteps: adaptedChainSteps,
    substitutions: allSubstitutions,
  };
}

/**
 * Build a human-readable provenance string.
 *
 * @param loopDescription The matched loop's description or ID.
 * @param instanceName The instance where the matched loop lives.
 * @param targetPlatform The platform adapted for (null if same platform or unknown).
 */
export function buildProvenance(
  loopDescription: string,
  instanceName: string,
  targetPlatform: PlatformType | null,
  hadSubstitutions: boolean,
): string | null {
  if (!loopDescription && !instanceName) return null;

  const platformLabel = targetPlatform === "github"
    ? "GitHub"
    : targetPlatform === "ado"
      ? "Azure DevOps"
      : null;

  if (hadSubstitutions && platformLabel) {
    return `Based on your ${loopDescription || "loop"} loop on ${instanceName}, adapted for ${platformLabel}`;
  }

  return `Based on your ${loopDescription || "loop"} loop on ${instanceName}`;
}
