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
import type { OptimizedScreenshot } from "./capture/screenshot.js";
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
import { gh155ReviewActionsScenario } from "./scenarios/gh-155-review-actions.js";

export interface ScenarioContext {
  readonly repoRoot: string;
  /** The Electron app — null when running in web (mock) mode. */
  readonly app: ElectronApplication | null;
  readonly window: Page;
  readonly temp: TempPaths;
  readonly config: VisualEvidenceConfig;
  readonly captureCheckpoint: (label: string, caption: string) => Promise<void>;
}

export interface CapturedCheckpoint {
  readonly label: string;
  readonly caption: string;
  readonly screenshot: OptimizedScreenshot;
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
  evidenceContract: {
    criteria: [
      {
        id: "resolve-issue-set",
        description: "Resolve the referenced issue set from the prior stack.",
        assertionDescriptions: ["The requested issue stack is listed with every issue title"],
        captureLabels: ["confirmation"],
      },
      {
        id: "confirm-all-items",
        description: "Name every affected issue and intended label before applying.",
        assertionDescriptions: ["The confirmation names every issue and the to-refine label"],
        captureLabels: ["confirmation"],
      },
      {
        id: "per-item-results",
        description: "Report success or failure for every issue after one approval.",
        assertionDescriptions: ["Applying once reports a result for every issue including partial failure"],
        captureLabels: ["result"],
      },
    ],
  },
});

registerScenario({
  changeId: "gh-155-approve-request-changes-open-web",
  runner: gh155ReviewActionsScenario,
  description: "Approve or request changes in review mode and open the PR on the web",
  evidenceContract: {
    criteria: [
      {
        id: "review-actions",
        description: "Supported review actions are available in review mode.",
        assertionDescriptions: [
          "Review mode exposes Approve, Request changes, and Open on web actions",
        ],
        captureLabels: ["review-actions"],
      },
      {
        id: "request-changes",
        description: "Request changes accepts a comment and resolves the PR item.",
        assertionDescriptions: [
          "Request changes requires a comment and marks the PR reviewed",
        ],
        captureLabels: ["request-changes"],
      },
      {
        id: "approve",
        description: "Approve resolves a queued PR item.",
        assertionDescriptions: ["Approve marks another queued PR reviewed"],
        captureLabels: ["approved"],
      },
      {
        id: "open-on-web",
        description: "Open on web launches the selected PR URL.",
        assertionDescriptions: ["Open on web launches the selected pull request URL"],
        captureLabels: ["review-actions"],
      },
    ],
  },
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
  evidenceContract: {
    criteria: [
      {
        id: "diff-file-list",
        description: "Review mode shows changed files and line statistics.",
        assertionDescriptions: [
          "The diff file list is visible with file entries",
          "File stats (additions/deletions) are visible in the file list",
        ],
        captureLabels: ["unified-diff"],
      },
      {
        id: "unified-diff",
        description: "Selecting a text file displays its unified diff.",
        assertionDescriptions: ["Selecting a file shows its unified diff with line coloring"],
        captureLabels: ["unified-diff"],
      },
      {
        id: "binary-fallback",
        description: "Selecting a binary file displays a readable fallback.",
        assertionDescriptions: ["Binary file shows a label instead of diff content"],
        captureLabels: ["binary-file"],
      },
    ],
  },
});

registerScenario({
  changeId: "gh-154-agent-briefing-default",
  runner: gh154AgentBriefingDefaultScenario,
  description: "Agent briefing as the default PR review view with flagged hunks inline and boilerplate collapsed",
  evidenceContract: {
    criteria: [
      {
        id: "briefing-default",
        description: "Review mode opens on the agent briefing instead of raw diff.",
        assertionDescriptions: [
          "The briefing view is the default view in review mode (not raw diff)",
          "The briefing summary is visible with analysis text",
          "Flagged files are visible with risk chips and inline diff hunks",
        ],
        captureLabels: ["briefing"],
      },
      {
        id: "boilerplate-disclosure",
        description: "Boilerplate files remain grouped behind a disclosure.",
        assertionDescriptions: ["Boilerplate section is present and collapsed by default"],
        captureLabels: ["briefing"],
      },
      {
        id: "raw-diff-fallback",
        description: "The raw diff remains available as a fallback.",
        assertionDescriptions: ["Clicking the Raw diff tab switches to the raw diff view"],
        captureLabels: ["raw-diff"],
      },
    ],
  },
});
