// Pure functions for detecting structural chain changes and
// discovering sibling loops that share the same structural shape.
//
// Key distinction:
//   - "Structural" changes = topology changes (add/remove/reorder steps,
//     add/remove branches). These propagate to siblings.
//   - "Slot-value" changes = command text, arguments, prompt wording.
//     These never trigger sibling offers.

import type { ChainStep, LoopShape } from "../../shared/ipc";
import type { ChainTopology, StructuralDiff, StructuralOp, SiblingCandidate } from "../../shared/sibling-offer-types";
import type { ChainEditOperationSummary } from "./chat/types";
import type { ReachabilityState } from "../../shared/ipc";

// ── Structural change detection ────────────────────────────────────────

/**
 * Determine whether a chain edit is structural (should be offered
 * to siblings) or a slot-value change (should not).
 *
 * A change is structural if any operation:
 *   - Creates a new task (adds a step to the chain)
 *   - Deletes a task (removes a step from the chain)
 *   - Updates the chain topology (modifies onSuccessTaskId or
 *     onFailureTaskId, which changes the chain graph)
 *
 * A change is a slot-value change if all operations only update
 * command text, commandArgs, name, or description without changing
 * the chain topology.
 *
 * Returns a summary of structural operations, or null if the change
 * is purely a slot-value change.
 */
export function detectStructuralChanges(
  operationSummaries: ChainEditOperationSummary[],
  proposedSteps: ChainStep[],
): StructuralOp[] | null {
  const structuralOps: StructuralOp[] = [];

  for (const op of operationSummaries) {
    switch (op.kind) {
      case "create-task":
        // Adding a step is always structural
        structuralOps.push({
          kind: "add-step",
          description: op.description,
          taskName: extractTaskNameFromDescription(op.description),
        });
        break;

      case "delete-task":
        // Removing a step is always structural
        structuralOps.push({
          kind: "remove-step",
          description: op.description,
          taskName: extractTaskNameFromDescription(op.description),
        });
        break;

      case "update-task":
        // An update-task operation is structural ONLY if it changes
        // the chain topology (onSuccessTaskId or onFailureTaskId).
        // We cannot determine this from the operation summary alone;
        // we need to check the proposed steps.
        // For now, we conservatively check: if the description mentions
        // chain topology keywords, treat as structural. Otherwise, skip.
        if (isTopologyChangeDescription(op.description)) {
          structuralOps.push({
            kind: detectUpdateOpKind(op.description),
            description: op.description,
            taskName: extractTaskNameFromDescription(op.description),
          });
        }
        // If no topology keywords, this is a slot-value change: skip it
        break;
    }
  }

  return structuralOps.length > 0 ? structuralOps : null;
}

/**
 * Heuristic: does the description of an update-task operation
 * suggest a chain topology change?
 */
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

/**
 * Detect the kind of structural operation from its description.
 */
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

/**
 * Extract a task name from a description string like "Add step: Test after Build".
 * Returns the portion after the colon if present, otherwise the whole string.
 */
function extractTaskNameFromDescription(description: string): string {
  const colonIdx = description.indexOf(":");
  if (colonIdx >= 0) {
    return description.slice(colonIdx + 1).trim();
  }
  return description;
}

// ── Structural fingerprint ────────────────────────────────────────────

/**
 * Compute a stable fingerprint hash for a set of structural operations.
 * This is used for decline memory: the same structural change produces
 * the same fingerprint, while different changes produce different ones.
 */
export function fingerprintStructuralChange(ops: StructuralOp[]): string {
  // Simple hash: concatenate kind + position + taskName + branchType
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

// ── Topology extraction ────────────────────────────────────────────────

/**
 * Extract the chain topology (structure without slot values) from
 * a list of chain steps.
 */
export function extractTopology(steps: ChainStep[]): ChainTopology {
  return {
    steps: steps.map((s) => ({
      taskName: s.task.name.trim() || s.task.command,
      onSuccessTaskId: s.task.onSuccessTaskId,
      onFailureTaskId: s.task.onFailureTaskId,
    })),
  };
}

/**
 * Extract the chain topology from a LoopShape's chainSteps.
 */
export function extractTopologyFromShape(shape: LoopShape): ChainTopology {
  return {
    steps: shape.chainSteps.map((s) => ({
      taskName: s.taskName,
      onSuccessTaskId: s.onSuccessTaskId,
      onFailureTaskId: s.onFailureTaskId,
    })),
  };
}

// ── Shape matching ────────────────────────────────────────────────────

/**
 * Check whether two chain topologies are structurally identical.
 * Two topologies match if they have the same number of steps,
 * same task names (in order), and same branch structure.
 */
export function topologiesMatch(a: ChainTopology, b: ChainTopology): boolean {
  if (a.steps.length !== b.steps.length) return false;

  for (let i = 0; i < a.steps.length; i++) {
    const stepA = a.steps[i];
    const stepB = b.steps[i];

    // Task names must match (structural identity)
    if (stepA.taskName !== stepB.taskName) return false;

    // Branch structure must match
    const aHasSuccess = stepA.onSuccessTaskId !== null;
    const bHasSuccess = stepB.onSuccessTaskId !== null;
    const aHasFailure = stepA.onFailureTaskId !== null;
    const bHasFailure = stepB.onFailureTaskId !== null;

    if (aHasSuccess !== bHasSuccess || aHasFailure !== bHasFailure) return false;
  }

  return true;
}

// ── Structural diff computation ────────────────────────────────────────

/**
 * Compute the structural diff for an applied chain edit.
 * This is what gets offered to sibling loops.
 */
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

// ── Sibling discovery ──────────────────────────────────────────────────

/**
 * Find sibling loops across the fleet that share the same structural
 * shape as the edited loop (before the edit was applied).
 *
 * A "sibling" is a loop on another instance whose cached LoopShape
 * has the same chain topology as the edited loop's pre-edit shape.
 * This excludes the loop that was just edited and unreachable instances.
 *
 * Returns candidates sorted by environment name for predictable ordering.
 */
export function findSiblingLoops(params: {
  /** The pre-edit topology of the edited loop. */
  preEditTopology: ChainTopology;
  /** The environment ID of the edited loop (excluded from siblings). */
  sourceEnvironmentId: string;
  /** All cached LoopShapes across the fleet. */
  allShapes: LoopShape[];
  /** Per-environment reachability map. */
  reachability: Record<string, ReachabilityState>;
  /** Environment names for display. */
  environments: Array<{ id: string; name: string }>;
  /** Per-environment projects, for resolving project names. */
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
    // Skip the source environment (the loop that was just edited)
    if (shape.environmentId === sourceEnvironmentId) continue;

    // Skip unreachable instances
    const state = reachability[shape.environmentId];
    if (state !== "connected") continue;

    // Check topology match
    const shapeTopology = extractTopologyFromShape(shape);
    if (!topologiesMatch(preEditTopology, shapeTopology)) continue;

    // Resolve display names
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

  // Sort by environment name for predictable ordering
  candidates.sort((a, b) => a.environmentName.localeCompare(b.environmentName));
  return candidates;
}
