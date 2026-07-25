import type { LoopShape, PlatformType } from "../../shared/ipc";
import { normalizeCommand } from "./fleet-similarity";

export interface ShapeSubstitution {
  from: string;
  to: string;
  field: string;
}

export interface AdaptedShape {
  command: string;
  commandArgs: string[];
  chainSteps: Array<{
    taskId: string;
    taskName: string;
    command: string;
    commandArgs: string[];
    onSuccessTaskId: string | null;
    onFailureTaskId: string | null;
  }>;
  substitutions: ShapeSubstitution[];
}

export interface ShapeAdaptation {
  loopId: string;
  environmentId: string;
  environmentName: string;
  loopDescription: string;
  chainSteps: AdaptedShape["chainSteps"];
  substitutions: ShapeSubstitution[];
}

const PLATFORM_SUBSTITUTIONS: Array<{
  github: string;
  ado: string;
  scope: "command" | "arg" | "url";
}> = [
  { github: "gh", ado: "az", scope: "command" },
  { github: "pr create", ado: "repos pr create", scope: "command" },
  { github: "issue create", ado: "boards work-item create", scope: "command" },
  { github: "issue list", ado: "boards work-item list", scope: "command" },
  { github: "issue view", ado: "boards work-item show", scope: "command" },
  { github: "github.com", ado: "dev.azure.com", scope: "url" },
  { github: "--repo", ado: "--organization", scope: "arg" },
  { github: "--owner", ado: "--organization", scope: "arg" },
];

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

    if (rule.scope === "url") {
      if (result.includes(from)) {
        result = result.split(from).join(to);
        substitutions.push({ from, to, field });
      }
    } else {
      const regex = new RegExp(`(?<=^|\\s)${escapeRegex(from)}(?=\\s|$)`, "g");
      if (regex.test(result)) {
        result = result.replace(new RegExp(`(?<=^|\\s)${escapeRegex(from)}(?=\\s|$)`, "g"), to);
        substitutions.push({ from, to, field });
      }
    }
  }

  return { result, substitutions };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

export function adaptShapeForPlatform(
  shape: LoopShape,
  targetPlatform: PlatformType,
): AdaptedShape {
  const sourcePlatform = detectCommandPlatform(shape.command);

  const commandResult = adaptString(shape.command, sourcePlatform, targetPlatform, "command");

  const allSubstitutions: ShapeSubstitution[] = [...commandResult.substitutions];
  const adaptedArgs: string[] = shape.commandArgs.map((arg, i) => {
    const r = adaptString(arg, sourcePlatform, targetPlatform, `commandArg[${i}]`);
    allSubstitutions.push(...r.substitutions);
    return r.result;
  });

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
