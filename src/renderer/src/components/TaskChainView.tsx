import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TaskDefinition } from "../types";
import { commandLine } from "../format";

export type BranchType = "success" | "failure" | null;

export interface ChainStep {
  task: TaskDefinition;
  stepNumber: number;
  branchType: BranchType;
  parentHasBranch: boolean;
  depth: number;
}

// Follows on-success as "main" chain; on-failure paths are branch steps.
// Guards against cycles (max 20 steps).
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

  while (currentId && !visited.has(currentId) && steps.length < 20) {
    visited.add(currentId);
    const task = taskMap.get(currentId);
    if (!task) break;

    stepNumber++;

    const hasBranch = !!(task.onSuccessTaskId && task.onFailureTaskId);

    steps.push({
      task,
      stepNumber,
      branchType: null,
      parentHasBranch: false,
      depth: 0,
    });

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

    currentId = task.onSuccessTaskId;
  }

  // Post-process: set branchType="success" and parentHasBranch on main-chain
  // steps that follow a branch point.
  for (let i = 1; i < steps.length; i++) {
    const step = steps[i];
    if (step.depth > 0) continue;

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

interface TaskChainViewProps {
  steps: ChainStep[];
}

export function TaskChainView({ steps }: TaskChainViewProps): React.ReactNode {
  const { t } = useTranslation();

  if (steps.length === 0) {
    return (
      <div className="task-chain task-chain--empty">
        <span className="task-chain-empty-text">
          {t("taskChain.noTasks")}
        </span>
      </div>
    );
  }

  const hasBranches = steps.some((s) => s.parentHasBranch);

  return (
    <div className={`task-chain${hasBranches ? " task-chain--branched" : ""}`}>
      <div className="task-chain-header">
        <span className="task-chain-header-label">
          {t("taskChain.label")}
        </span>
        <span className="task-chain-header-count">
          {t("taskChain.stepCount", { count: steps.length })}
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

const COMMAND_MAX_LINES = 4;

function TaskChainStep({ step, showConnector, hasBranches }: TaskChainStepProps): React.ReactNode {
  const { t } = useTranslation();
  const [commandExpanded, setCommandExpanded] = useState(false);

  const cmdLine = commandLine(step.task.command, step.task.commandArgs);
  const taskName = (step.task.name ?? "").trim();
  const displayName = taskName || cmdLine;
  const hasNamedTask = taskName.length > 0;

  let connectorVariant: "default" | "ok" | "fail" = "default";
  let branchLabel: string | null = null;

  if (hasBranches && step.parentHasBranch) {
    if (step.branchType === "success") {
      connectorVariant = "ok";
      branchLabel = t("taskChain.onSuccess");
    } else if (step.branchType === "failure") {
      connectorVariant = "fail";
      branchLabel = t("taskChain.onFailure");
    }
  }

  return (
    <div
      className={`task-chain-step${step.depth > 0 ? " task-chain-step--branched" : ""}`}
      style={{ paddingLeft: step.depth > 0 ? 20 : 0 }}
    >
      {showConnector && (
        <div className={`task-chain-connector${connectorVariant !== "default" ? ` task-chain-connector--${connectorVariant}` : ""}`}>
          {connectorVariant === "ok" && (
            <span className="task-chain-connector-ok">{t("taskChain.ok")}</span>
          )}
        </div>
      )}

      {branchLabel && (
        <div className={`task-chain-branch-label${step.branchType === "failure" ? " task-chain-branch-label--fail" : " task-chain-branch-label--success"}`}>
          {branchLabel}
        </div>
      )}

      <div className="task-chain-step-row">
        <span className="task-chain-step-number">{step.stepNumber}</span>

        <div className="task-chain-step-content">
          <div className="task-chain-step-name">{displayName}</div>

          {(hasNamedTask || cmdLine) && (
            <button
              className="task-chain-step-toggle-cmd"
              onClick={() => setCommandExpanded((prev) => !prev)}
              type="button"
              aria-expanded={commandExpanded}
            >
              {commandExpanded
                ? t("taskChain.hideCommand")
                : t("taskChain.showCommand")}
            </button>
          )}
        </div>
      </div>

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
