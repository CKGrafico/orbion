/**
 * Derive a visual-validation scenario from the available context.
 *
 * Priority order (highest wins):
 *   1. Explicit scenario instructions (from EvidenceInput)
 *   2. Acceptance criteria (from the OpenSpec proposal/archive)
 *   3. OpenSpec proposal body
 *   4. OpenSpec tasks
 *   5. Issue description (from EvidenceInput)
 *   6. Changed UI files
 *   7. Existing application tests / behavior
 *
 * The deriver is deliberately conservative: when context is insufficient to
 * build a meaningful scenario, it returns `blocked` rather than fabricating
 * a scenario that an autonomous agent cannot actually execute.
 */
import type {
  ChangeContext,
  EvidenceInput,
  Scenario,
  ScenarioInstruction,
} from "./types.js";

export interface ScenarioDerivation {
  readonly scenario: Scenario | null;
  readonly source: string;
  readonly blocked: boolean;
  readonly reason?: string;
}

function fromInstruction(inst: ScenarioInstruction): Scenario {
  return { title: inst.title, steps: inst.steps };
}

function fromAcceptanceCriteria(criteria: readonly string[]): Scenario | null {
  if (criteria.length === 0) return null;
  return {
    title: "Validate acceptance criteria",
    steps: criteria.map((c) => `Verify: ${c}`),
  };
}

function extractStepsFromProposal(proposal: string | undefined): Scenario | null {
  if (!proposal) return null;
  // Find the body under "## Solution" / "### Approach" / "### What" — i.e.,
  // everything from the line after the heading until the next same-or-higher
  // level heading or end of document.
  const lines = proposal.split("\n");
  let inSection = false;
  const bodyLines: string[] = [];
  for (const line of lines) {
    const isHeading = /^#{1,6}\s+/.test(line);
    if (isHeading) {
      if (inSection) break; // Next heading ends the section
      if (/^#{2,3}\s+(?:Solution|Approach|What)\b/i.test(line)) {
        inSection = true;
      }
      continue;
    }
    if (inSection) bodyLines.push(line);
  }
  const body = bodyLines.join("\n");
  const bodyOrProposal = body.length > 0 ? body : proposal;

  // Pull numbered list items (1. 2. 3.) or bullet items
  const stepLines = bodyOrProposal.split("\n");
  const steps: string[] = [];
  for (const line of stepLines) {
    const trimmed = line.trim();
    const numbered = trimmed.match(/^\d+\.\s+(.+)$/);
    const bulleted = trimmed.match(/^[-*]\s+(.+)$/);
    const match = numbered ?? bulleted;
    if (match) steps.push(match[1]!.trim());
  }
  if (steps.length < 2) return null;
  return { title: "Validate proposed scenario", steps };
}

function fromTasks(tasks: string | undefined): Scenario | null {
  if (!tasks) return null;
  const lines = tasks.split("\n");
  const steps: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*(?:-\s*\[[ xX]\]\s*)?\d+(?:\.\d+)?\s+(.+)$/);
    if (m) steps.push(m[1]!.replace(/\s*<!--.*-->\s*$/, "").trim());
  }
  if (steps.length < 2) return null;
  return { title: "Validate implemented tasks", steps };
}

function fromIssue(ctx: EvidenceInput): Scenario | null {
  if (!ctx.issue) return null;
  const steps: string[] = [];
  if (ctx.issue.description) {
    const lines = ctx.issue.description
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    steps.push(...lines.slice(0, 8));
  }
  if (ctx.issue.acceptanceCriteria.length > 0) {
    return fromAcceptanceCriteria(ctx.issue.acceptanceCriteria);
  }
  if (steps.length < 2) return null;
  return { title: `Validate issue #${ctx.issue.number}: ${ctx.issue.title}`, steps };
}

function fromChangedUiFiles(files: readonly string[]): Scenario | null {
  if (files.length === 0) return null;
  // Only useful when the files are renderer paths
  const uiFiles = files.filter((f) =>
    /src\/renderer\/|components\/|features\//i.test(f),
  );
  if (uiFiles.length === 0) return null;
  return {
    title: "Validate changed UI surfaces render without errors",
    steps: uiFiles.slice(0, 6).map((f) => `Open the screen containing ${f} and verify it renders correctly`),
  };
}

export function deriveScenario(
  ctx: ChangeContext,
  input: EvidenceInput,
): ScenarioDerivation {
  // 1. Explicit scenario
  if (input.scenario && input.scenario.steps.length > 0) {
    return {
      scenario: fromInstruction(input.scenario),
      source: "explicit input",
      blocked: false,
    };
  }

  // 2. Acceptance criteria
  const fromAc = fromAcceptanceCriteria(ctx.acceptanceCriteria);
  if (fromAc) {
    return { scenario: fromAc, source: "acceptance criteria", blocked: false };
  }

  // 3. Proposal
  const fromProp = extractStepsFromProposal(ctx.proposal);
  if (fromProp) {
    return { scenario: fromProp, source: "proposal", blocked: false };
  }

  // 4. Tasks
  const fromTaskList = fromTasks(ctx.tasks);
  if (fromTaskList) {
    return { scenario: fromTaskList, source: "tasks", blocked: false };
  }

  // 5. Issue
  const fromIssueCtx = fromIssue(input);
  if (fromIssueCtx) {
    return { scenario: fromIssueCtx, source: "issue description", blocked: false };
  }

  // 6. Changed UI files
  const files = input.changedFiles ?? ctx.affectedFiles;
  const fromFiles = fromChangedUiFiles(files);
  if (fromFiles) {
    return { scenario: fromFiles, source: "changed UI files", blocked: false };
  }

  return {
    scenario: null,
    source: "none",
    blocked: true,
    reason:
      "Insufficient context to derive a meaningful validation scenario. Provide an explicit scenario, acceptance criteria, or changed UI files.",
  };
}
