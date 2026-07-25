import type { ChainStep, LoopShape } from "../../shared/ipc";
import type { ChainTopology, StructuralDiff, StructuralOp, SiblingCandidate } from "../../shared/sibling-offer-types";
import type { ChainEditOperationSummary } from "./chat/types";
import type { ReachabilityState } from "../../shared/ipc";

export function detectStructuralChanges(
  operationSummaries: ChainEditOperationSummary[],
  proposedSteps: ChainStep[],
): StructuralOp[] | null {
  const structuralOps: StructuralOp[] = [];

  for (const op of operationSummaries) {
    switch (op.kind) {
      case "create-task":
        structuralOps.push({
          kind: "add-step",
          description: op.description,
          taskName: extractTaskNameFromDescription(op.description),
        });
        break;

      case "delete-task":
        structuralOps.push({
          kind: "remove-step",
          description: op.description,
          taskName: extractTaskNameFromDescription(op.description),
        });
        break;

      case "update-task":
        // Only topology changes (onSuccess/onFailure) are structural;
        // slot-value changes (command text, args) are not.
        if (isTopologyChangeDescription(op.description)) {
          structuralOps.push({
            kind: detectUpdateOpKind(op.description),
            description: op.description,
            taskName: extractTaskNameFromDescription(op.description),
          });
        }
        break;
    }
  }

  return structuralOps.length > 0 ? structuralOps : null;
}

function isTopologyChangeDescription(description: string): boolean {
  const lower = description.toLowerCase();
  return (
    lower.includes("on-success") ||
    lower.includes("on-failure") ||
    lower.includes("on_success") ||
    lower.includes("on_failure") ||
    lower.includes("chain") ||
    lower.includes("branch") ||
    lower.includes("after") ||
    lower.includes("before") ||
    lower.includes("reorder") ||
    lower.includes("add step") ||
    lower.includes("insert step") ||
    lower.includes("remove step")
  );
}

function detectUpdateOpKind(description: string): StructuralOp["kind"] {
  const lower = description.toLowerCase();
  if (lower.includes("reorder") || lower.includes("move") || lower.includes("before") || lower.includes("after")) {
    return "reorder-step";
  }
  if (lower.includes("branch") || lower.includes("on-failure") || lower.includes("on-success")) {
    return lower.includes("remove") || lower.includes("clear") ? "remove-branch" : "add-branch";
  }
  return "add-step";
}

function extractTaskNameFromDescription(description: string): string {
  const colonIdx = description.indexOf(":");
  if (colonIdx >= 0) {
    return description.slice(colonIdx + 1).trim();
  }
  return description;
}

export function fingerprintStructuralChange(ops: StructuralOp[]): string {
  const parts = ops.map((op) =>
    `${op.kind}:${op.position ?? ""}:${op.taskName ?? ""}:${op.branchType ?? ""}`,
  );
  const raw = parts.join("|");
  // DJB2 hash
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) & 0xffffffff;
  }
  return hash.toString(16);
}

export function extractTopology(steps: ChainStep[]): ChainTopology {
  return {
    steps: steps.map((s) => ({
      taskName: s.task.name.trim() || s.task.command,
      onSuccessTaskId: s.task.onSuccessTaskId,
      onFailureTaskId: s.task.onFailureTaskId,
    })),
  };
}

export function extractTopologyFromShape(shape: LoopShape): ChainTopology {
  return {
    steps: shape.chainSteps.map((s) => ({
      taskName: s.taskName,
      onSuccessTaskId: s.onSuccessTaskId,
      onFailureTaskId: s.onFailureTaskId,
    })),
  };
}

export function topologiesMatch(a: ChainTopology, b: ChainTopology): boolean {
  if (a.steps.length !== b.steps.length) return false;

  for (let i = 0; i < a.steps.length; i++) {
    const stepA = a.steps[i];
    const stepB = b.steps[i];

    if (stepA.taskName !== stepB.taskName) return false;

    const aHasSuccess = stepA.onSuccessTaskId !== null;
    const bHasSuccess = stepB.onSuccessTaskId !== null;
    const aHasFailure = stepA.onFailureTaskId !== null;
    const bHasFailure = stepB.onFailureTaskId !== null;

    if (aHasSuccess !== bHasSuccess || aHasFailure !== bHasFailure) return false;
  }

  return true;
}

export function computeStructuralDiff(
  sourceLoopId: string,
  sourceEnvironmentId: string,
  ops: StructuralOp[],
  postEditTopology: ChainTopology,
): StructuralDiff {
  return {
    sourceLoopId,
    sourceEnvironmentId,
    operations: ops,
    fingerprint: fingerprintStructuralChange(ops),
    postEditTopology,
  };
}

export function findSiblingLoops(params: {
  preEditTopology: ChainTopology;
  sourceEnvironmentId: string;
  allShapes: LoopShape[];
  reachability: Record<string, ReachabilityState>;
  environments: Array<{ id: string; name: string }>;
  perEnvProjects?: Record<string, Array<{ id: string; name: string }>>;
}): SiblingCandidate[] {
  const {
    preEditTopology,
    sourceEnvironmentId,
    allShapes,
    reachability,
    environments,
    perEnvProjects,
  } = params;

  const candidates: SiblingCandidate[] = [];

  for (const shape of allShapes) {
    if (shape.environmentId === sourceEnvironmentId) continue;

    const state = reachability[shape.environmentId];
    if (state !== "connected") continue;

    const shapeTopology = extractTopologyFromShape(shape);
    if (!topologiesMatch(preEditTopology, shapeTopology)) continue;

    const envName = environments.find((e) => e.id === shape.environmentId)?.name ?? shape.environmentId;
    let projectName = "Default";
    if (perEnvProjects && shape.projectId) {
      const envProjects = perEnvProjects[shape.environmentId] ?? [];
      const project = envProjects.find((p) => p.id === shape.projectId);
      if (project) projectName = project.name;
    }

    candidates.push({
      loopId: shape.loopId,
      environmentId: shape.environmentId,
      environmentName: envName,
      loopDescription: shape.command,
      projectName,
    });
  }

  candidates.sort((a, b) => a.environmentName.localeCompare(b.environmentName));
  return candidates;
}
