/**
 * Scenario registry.
 *
 * Maps a change-id (or scenario-key) to a concrete Playwright scenario runner.
 *
 * The framework never guesses selectors. When the scenario-deriver produces a
 * textual scenario for which no concrete runner is registered, the run returns a
 * `blocked` result rather than fabricating interactions.
 *
 * Each registered scenario receives a {@link ScenarioContext} handle: the
 * launched Electron app + first window + temp paths + config. The runner is
 * responsible for performing assertions via {@link ../assertions.ts} and may
 * either return asserted results directly OR throw {@link AssertionFailure}
 * (caught by the orchestrator).
 */
import type { Page, ElectronApplication } from "playwright";
import type { VisualEvidenceConfig } from "./config.js";
import type { TempPaths } from "./launch/deterministic-env.js";
import type {
  AssertionResult,
  Scenario,
  ScenarioEvidenceContract,
} from "./types.js";
import { AssertionFailure } from "./assertions.js";
import { gh142BulkRelabelScenario } from "./scenarios/gh-142-bulk-relabel.js";
import { gh146FleetShapedLoopsScenario } from "./scenarios/gh-146-fleet-shaped-loops.js";
import { gh147SiblingStructuralOffersScenario } from "./scenarios/gh-147-sibling-structural-offers.js";
import { gh149AgentRiskVerdictScenario } from "./scenarios/gh-149-agent-risk-verdict.js";
import { gh150OvernightPrDigestScenario } from "./scenarios/gh-150-overnight-pr-digest.js";
import { gh151ReviewModeFromNotificationScenario } from "./scenarios/gh-151-review-mode-from-notification.js";
import { gh152ReviewQueueStripScenario } from "./scenarios/gh-152-review-queue-strip.js";
import { gh153DiffViewReviewModeScenario } from "./scenarios/gh-153-diff-view-review-mode.js";
import { gh154AgentBriefingDefaultScenario } from "./scenarios/gh-154-agent-briefing-default.js";

export interface ScenarioContext {
  readonly repoRoot: string;
  /** The Electron app — null when running in web (mock) mode. */
  readonly app: ElectronApplication | null;
  readonly window: Page;
  readonly temp: TempPaths;
  readonly config: VisualEvidenceConfig;
}

export interface ScenarioResult {
  readonly scenario: Scenario;
  readonly assertions: readonly AssertionResult[];
}

export type ScenarioRunner = (ctx: ScenarioContext) => Promise<ScenarioResult>;

export interface ScenarioDefinition {
  readonly changeId: string;
  readonly runner: ScenarioRunner;
  readonly description?: string;
  readonly evidenceContract?: ScenarioEvidenceContract;
}

const REGISTRY = new Map<string, ScenarioDefinition>();

export function registerScenario(def: ScenarioDefinition): void {
  REGISTRY.set(def.changeId, def);
}

export function getScenario(changeId: string): ScenarioDefinition | null {
  return REGISTRY.get(changeId) ?? null;
}

export function listRegisteredScenarios(): readonly string[] {
  return Array.from(REGISTRY.keys()).sort();
}

export interface ContractValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export function validateEvidenceContract(
  definition: ScenarioDefinition,
  assertions: readonly AssertionResult[],
  capturedLabels: ReadonlySet<string>,
): ContractValidationResult {
  const contract = definition.evidenceContract;
  if (!contract || contract.criteria.length === 0) {
    return {
      valid: false,
      errors: [`Scenario "${definition.changeId}" has no evidence contract.`],
    };
  }

  const errors: string[] = [];
  const assertionByDescription = new Map(assertions.map((assertion) => [assertion.description, assertion]));
  const criterionIds = new Set<string>();

  for (const criterion of contract.criteria) {
    if (!criterion.id.trim() || criterionIds.has(criterion.id)) {
      errors.push(`Criterion id "${criterion.id}" is empty or duplicated.`);
    }
    criterionIds.add(criterion.id);

    if (criterion.assertionDescriptions.length === 0) {
      errors.push(`Criterion "${criterion.id}" has no assertions.`);
    }
    for (const description of criterion.assertionDescriptions) {
      const assertion = assertionByDescription.get(description);
      if (!assertion) {
        errors.push(`Criterion "${criterion.id}" references missing assertion "${description}".`);
      } else if (assertion.status !== "passed") {
        errors.push(`Criterion "${criterion.id}" assertion did not pass: "${description}".`);
      }
    }

    if (criterion.captureLabels.length === 0) {
      errors.push(`Criterion "${criterion.id}" has no capture checkpoint.`);
    }
    for (const label of criterion.captureLabels) {
      if (!capturedLabels.has(label)) {
        errors.push(`Criterion "${criterion.id}" is missing capture checkpoint "${label}".`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Wrapper that converts thrown AssertionFailures into structured failed assertions. */
export async function runScenario(def: ScenarioDefinition, ctx: ScenarioContext): Promise<ScenarioResult> {
  try {
    return await def.runner(ctx);
  } catch (err) {
    if (err instanceof AssertionFailure) {
      return {
        scenario: {
          title: def.changeId,
          steps: [],
        },
        assertions: [{ description: err.message, status: "failed", error: err.message }],
      };
    }
    throw err;
  }
}

// ── Built-in registrations ───────────────────────────────────────────────

registerScenario({
  changeId: "gh-142-bulk-relabel",
  runner: gh142BulkRelabelScenario,
  description: "Bulk relabel issues using a sentence (InfraChatPanel flow)",
});

registerScenario({
  changeId: "gh-146-fleet-shaped-loops",
  runner: gh146FleetShapedLoopsScenario,
  description: "Fleet-shaped loop proposals with provenance and platform adaptation",
});

registerScenario({
  changeId: "gh-147-sibling-structural-offers",
  runner: gh147SiblingStructuralOffersScenario,
  description: "Offer structural chain improvements to sibling loops after chain edit",
});

registerScenario({
  changeId: "gh-149-agent-risk-verdict",
  runner: gh149AgentRiskVerdictScenario,
  description: "Agent risk verdict on each PR inbox item",
});

registerScenario({
  changeId: "gh-150-overnight-pr-digest",
  runner: gh150OvernightPrDigestScenario,
  description: "Overnight digest notification grouping PR batches by verdict",
});

registerScenario({
  changeId: "gh-151-review-mode-from-notification",
  runner: gh151ReviewModeFromNotificationScenario,
  description: "Enter review mode from a PR inbox notification and exit with Esc",
});

registerScenario({
  changeId: "gh-152-review-queue-strip",
  runner: gh152ReviewQueueStripScenario,
  description: "Review queue strip showing PR batch with verdict chips and selection",
});

registerScenario({
  changeId: "gh-153-diff-view-review-mode",
  runner: gh153DiffViewReviewModeScenario,
  description: "Diff viewer in review mode with file list, unified diff, and binary file labels",
});

registerScenario({
  changeId: "gh-154-agent-briefing-default",
  runner: gh154AgentBriefingDefaultScenario,
  description: "Agent briefing as the default PR review view with flagged hunks inline and boilerplate collapsed",
});
