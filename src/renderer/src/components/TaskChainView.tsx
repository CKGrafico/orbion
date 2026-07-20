import React, { useState } from "react";
import { useIntl } from "react-intl";
import type { TaskDefinition } from "../types";
import { commandLine } from "../format";

// ── Chain resolution ──────────────────────────────────────────────────

/** Branch type for a step relative to its parent in the chain. */
export type BranchType = "success" | "failure" | null;

/** A single step in the resolved task chain. */
export interface ChainStep {
  /** The task definition at this step. */
  task: TaskDefinition;
  /** Step number (1-based, for display). */
  stepNumber: number;
  /** Whether this step is the on-success continuation or on-failure branch from the previous step. */
  branchType: BranchType;
  /** True if the *parent* step that produced this step has both onSuccess and onFailure branches. */
  parentHasBranch: boolean;
  /** Indent depth for visual nesting (0 = main chain, 1 = branch). */
  depth: number;
}

/**
 * Resolve the task chain starting from a given task ID.
 *
 * Follows the on-success chain as the "main" execution order.
 * When a task has both `onSuccessTaskId` and `onFailureTaskId`,
 * the on-success path continues the main chain with branchType="success"
 * and the on-failure path is recorded as a branch step with branchType="failure".
 *
 * The `parentHasBranch` flag is set on both children when a parent has
 * both branches. This allows the renderer to show "ok" / "on failure"
 * markers only when a branch point actually exists.
 *
 * Guards against cycles (max 20 steps) to prevent infinite loops.
 */
export function resolveTaskChain(
  startTaskId: string | null | undefined,
  tasks: TaskDefinition[],
): ChainStep[] {
  if (!startTaskId) return [];

  const taskMap = new Map<string, TaskDefinition>();
  for (const t of tasks) taskMap.set(t.id, t);

  const visited = new Set<string>();
  const steps: ChainStep[] = [];
  let currentId: string | null = startTaskId;
  let stepNumber = 0;

  // Walk the on-success chain (main path)
  while (currentId && !visited.has(currentId) && steps.length < 20) {
    visited.add(currentId);
    const task = taskMap.get(currentId);
    if (!task) break;

    stepNumber++;

    // Determine whether this task has both branches
    const hasBranch = !!(task.onSuccessTaskId && task.onFailureTaskId);

    steps.push({
      task,
      stepNumber,
      branchType: null,
      parentHasBranch: false,
      depth: 0,
    });

    // If there's an on-failure branch, add it as a branch step
    if (task.onFailureTaskId && !visited.has(task.onFailureTaskId)) {
      const failureTask = taskMap.get(task.onFailureTaskId);
      if (failureTask) {
        visited.add(task.onFailureTaskId);
        stepNumber++;
        steps.push({
          task: failureTask,
          stepNumber,
          branchType: "failure",
          parentHasBranch: hasBranch,
          depth: 1,
        });
        // Follow the failure branch chain (at depth 1)
        let branchId = failureTask.onSuccessTaskId;
        while (branchId && !visited.has(branchId) && steps.length < 20) {
          visited.add(branchId);
          const branchTask = taskMap.get(branchId);
          if (!branchTask) break;
          stepNumber++;
          steps.push({
            task: branchTask,
            stepNumber,
            branchType: null,
            parentHasBranch: false,
            depth: 1,
          });
          branchId = branchTask.onSuccessTaskId;
        }
      }
    }

    // Mark the next on-success step
    if (task.onSuccessTaskId && !visited.has(task.onSuccessTaskId)) {
      // Peek at the next step to set branchType and parentHasBranch
      const nextTask = taskMap.get(task.onSuccessTaskId);
      if (nextTask && hasBranch) {
        // The next step on the success path needs the branch marker
        // We'll set these when we process it in the next iteration.
        // For now, store the parentHasBranch info on the current step
        // so we can propagate it.
        // Actually, we set it on the child step below.
      }
    }

    currentId = task.onSuccessTaskId;

    // Set branchType and parentHasBranch on the next main-chain step
    // if the current task has both branches
    if (hasBranch && currentId) {
      // The next iteration will push this step; we need to pre-mark it.
      // We do this by looking at the last step we'll add next iteration.
      // Instead, let's mark it after pushing: we'll update the step
      // after the while loop pushes it. But that's complex. Better approach:
      // after pushing each main-chain step, set branchType if the *previous*
      // main-chain step had branches.
    }
  }

  // Post-process: set branchType="success" and parentHasBranch on steps
  // that follow a branch point in the main chain.
  for (let i = 1; i < steps.length; i++) {
    const step = steps[i];
    if (step.depth > 0) continue; // Only main-chain steps

    // Look back at the previous main-chain step
    let prevMainIdx = i - 1;
    while (prevMainIdx >= 0 && steps[prevMainIdx].depth > 0) {
      prevMainIdx--;
    }
    if (prevMainIdx < 0) continue;

    const prevMainStep = steps[prevMainIdx];
    const hasBranch = !!(prevMainStep.task.onSuccessTaskId && prevMainStep.task.onFailureTaskId);
    if (hasBranch && step.branchType === null) {
      step.branchType = "success";
      step.parentHasBranch = true;
    }
    if (hasBranch) {
      // Also mark the failure branch step
      const failStep = steps.find(
        (s) => s.depth > 0 && s.branchType === "failure" && s.stepNumber > prevMainStep.stepNumber,
      );
      if (failStep) {
        failStep.parentHasBranch = true;
      }
    }
  }

  return steps;
}

// ── Component ─────────────────────────────────────────────────────────

interface TaskChainViewProps {
  steps: ChainStep[];
}

export function TaskChainView({ steps }: TaskChainViewProps): React.ReactNode {
  const intl = useIntl();

  if (steps.length === 0) {
    return (
      <div className="task-chain task-chain--empty">
        <span className="task-chain-empty-text">
          {intl.formatMessage({ id: "taskChain.noTasks" })}
        </span>
      </div>
    );
  }

  // Determine whether any branch points exist in the chain.
  // When true, we show "ok" markers and branch labels.
  // When false (purely linear), we render a simple vertical flow.
  const hasBranches = steps.some((s) => s.parentHasBranch);

  return (
    <div className={`task-chain${hasBranches ? " task-chain--branched" : ""}`}>
      <div className="task-chain-header">
        <span className="task-chain-header-label">
          {intl.formatMessage({ id: "taskChain.label" })}
        </span>
        <span className="task-chain-header-count">
          {intl.formatMessage({ id: "taskChain.stepCount" }, { count: steps.length })}
        </span>
      </div>
      <div className="task-chain-steps">
        {steps.map((step, idx) => (
          <TaskChainStep
            key={step.task.id}
            step={step}
            showConnector={idx > 0}
            hasBranches={hasBranches}
          />
        ))}
      </div>
    </div>
  );
}

interface TaskChainStepProps {
  step: ChainStep;
  showConnector: boolean;
  hasBranches: boolean;
}

/** Maximum visible lines for a disclosed command before truncation. */
const COMMAND_MAX_LINES = 4;

function TaskChainStep({ step, showConnector, hasBranches }: TaskChainStepProps): React.ReactNode {
  const intl = useIntl();
  const [commandExpanded, setCommandExpanded] = useState(false);

  const cmdLine = commandLine(step.task.command, step.task.commandArgs);
  const taskName = step.task.name.trim();
  const displayName = taskName || cmdLine;
  const hasNamedTask = taskName.length > 0;

  // Determine connector and label style based on branch type
  let connectorVariant: "default" | "ok" | "fail" = "default";
  let branchLabel: string | null = null;

  if (hasBranches && step.parentHasBranch) {
    if (step.branchType === "success") {
      connectorVariant = "ok";
      branchLabel = intl.formatMessage({ id: "taskChain.onSuccess" });
    } else if (step.branchType === "failure") {
      connectorVariant = "fail";
      branchLabel = intl.formatMessage({ id: "taskChain.onFailure" });
    }
  }

  return (
    <div
      className={`task-chain-step${step.depth > 0 ? " task-chain-step--branched" : ""}`}
      style={{ paddingLeft: step.depth > 0 ? 20 : 0 }}
    >
      {/* Connector line between steps */}
      {showConnector && (
        <div className={`task-chain-connector${connectorVariant !== "default" ? ` task-chain-connector--${connectorVariant}` : ""}`}>
          {connectorVariant === "ok" && (
            <span className="task-chain-connector-ok">{intl.formatMessage({ id: "taskChain.ok" })}</span>
          )}
        </div>
      )}

      {/* Branch label */}
      {branchLabel && (
        <div className={`task-chain-branch-label${step.branchType === "failure" ? " task-chain-branch-label--fail" : " task-chain-branch-label--success"}`}>
          {branchLabel}
        </div>
      )}

      <div className="task-chain-step-row">
        {/* Step number badge */}
        <span className="task-chain-step-number">{step.stepNumber}</span>

        {/* Step content -- description-forward layout */}
        <div className="task-chain-step-content">
          <div className="task-chain-step-name">{displayName}</div>

          {/* Command disclosure toggle -- always present when there is a command */}
          {(hasNamedTask || cmdLine) && (
            <button
              className="task-chain-step-toggle-cmd"
              onClick={() => setCommandExpanded((prev) => !prev)}
              type="button"
              aria-expanded={commandExpanded}
            >
              {commandExpanded
                ? intl.formatMessage({ id: "taskChain.hideCommand" })
                : intl.formatMessage({ id: "taskChain.showCommand" })}
            </button>
          )}
        </div>
      </div>

      {/* Raw command behind per-step disclosure, truncated gracefully */}
      {commandExpanded && cmdLine && (
        <div
          className="task-chain-step-command"
          style={{ "--cmd-max-lines": COMMAND_MAX_LINES } as React.CSSProperties}
        >
          <code>{cmdLine}</code>
        </div>
      )}
    </div>
  );
}
