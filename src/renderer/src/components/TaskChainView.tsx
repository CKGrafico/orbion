import React, { useState } from "react";
import { useIntl } from "react-intl";
import type { TaskDefinition } from "../types";
import { commandLine } from "../format";

// ── Chain resolution ──────────────────────────────────────────────────

/** A single step in the resolved task chain. */
export interface ChainStep {
  /** The task definition at this step. */
  task: TaskDefinition;
  /** Step number (1-based, for display). */
  stepNumber: number;
  /** Whether this step starts an on-success branch from the previous step. */
  isOnSuccessBranch?: boolean;
  /** Whether this step starts an on-failure branch from the previous step. */
  isOnFailureBranch?: boolean;
  /** Indent depth for visual nesting (0 = main chain). */
  depth: number;
}

/**
 * Resolve the linear task chain starting from a given task ID.
 *
 * Follows the on-success chain as the "main" execution order.
 * When a task has both `onSuccessTaskId` and `onFailureTaskId`,
 * the on-success path continues the main chain and the on-failure
 * path is recorded as abranch step.
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
  let stepNumber = 1;

  // Walk the on-success chain (main path)
  while (currentId && !visited.has(currentId) && steps.length < 20) {
    visited.add(currentId);
    const task = taskMap.get(currentId);
    if (!task) break;

    steps.push({
      task,
      stepNumber,
      depth: 0,
    });

    stepNumber++;

    // If there's an on-failure branch, add it as a branch step
    if (task.onFailureTaskId && !visited.has(task.onFailureTaskId)) {
      const failureTask = taskMap.get(task.onFailureTaskId);
      if (failureTask) {
        visited.add(task.onFailureTaskId);
        steps.push({
          task: failureTask,
          stepNumber,
          isOnFailureBranch: true,
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
            depth: 1,
          });
          branchId = branchTask.onSuccessTaskId;
        }
      }
    }

    currentId = task.onSuccessTaskId;
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

  // Branches are indicated per-step via isOnFailureBranch/isOnSuccessBranch,
  // so no top-level "hasBranches" flag is needed.

  return (
    <div className="task-chain">
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
          />
        ))}
      </div>
    </div>
  );
}

interface TaskChainStepProps {
  step: ChainStep;
  showConnector: boolean;
}

/** Maximum visible lines for a disclosed command before truncation. */
const COMMAND_MAX_LINES = 4;

function TaskChainStep({ step, showConnector }: TaskChainStepProps): React.ReactNode {
  const intl = useIntl();
  const [commandExpanded, setCommandExpanded] = useState(false);

  const cmdLine = commandLine(step.task.command, step.task.commandArgs);
  // Description-forward: task name is the primary label; command is behind the fold.
  // When the task has no name, we still use the command as the fallback display name
  // but keep a collapsed disclosure so the raw CLI string doesn't dominate the layout.
  const taskName = step.task.name.trim();
  const displayName = taskName || cmdLine;
  const hasNamedTask = taskName.length > 0;

  // Branch label
  let branchLabel: string | null = null;
  if (step.isOnFailureBranch) {
    branchLabel = intl.formatMessage({ id: "taskChain.onFailure" });
  } else if (step.isOnSuccessBranch) {
    branchLabel = intl.formatMessage({ id: "taskChain.onSuccess" });
  }

  return (
    <div
      className={`task-chain-step${step.depth > 0 ? " task-chain-step--branched" : ""}`}
      style={{ paddingLeft: step.depth > 0 ? 20 : 0 }}
    >
      {/* Connector line between steps */}
      {showConnector && (
        <div className={`task-chain-connector${step.depth > 0 && step.isOnFailureBranch ? " task-chain-connector--branch" : ""}`} />
      )}

      {/* Branch label */}
      {branchLabel && (
        <div className="task-chain-branch-label">
          {branchLabel}
        </div>
      )}

      <div className="task-chain-step-row">
        {/* Step number badge */}
        <span className="task-chain-step-number">{step.stepNumber}</span>

        {/* Step content — description-forward layout */}
        <div className="task-chain-step-content">
          <div className="task-chain-step-name">{displayName}</div>

          {/* Command disclosure toggle — always present when there is a command */}
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
