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
import { gh231TailscaleCliDetectionScenario } from "./scenarios/gh-231-tailscale-cli-detection.js";
import { gh201LiveLogReconnectScenario } from "./scenarios/gh-201-live-log-reconnect.js";
import { gh200LogTailNoOverwriteScenario } from "./scenarios/gh-200-log-tail-no-overwrite.js";
import { gh197SseMultiLineParserScenario } from "./scenarios/gh-197-sse-multi-line-parser.js";
import { gh165StaleConfigWarningScenario } from "./scenarios/gh-165-stale-config-warning.js";
import { gh164RestoreOfferScenario } from "./scenarios/gh-164-restore-offer.js";
import { gh163BootstrapSeedScenario } from "./scenarios/gh-163-bootstrap-seed.js";
import { gh162ReferencesNotSecretsScenario } from "./scenarios/gh-162-references-not-secrets.js";
import { gh156ChatInfraBugClusterScenario } from "./scenarios/gh-156-chat-infra-bug-cluster.js";

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

registerScenario({
  changeId: "gh-231-tailscale-cli-detection",
  runner: gh231TailscaleCliDetectionScenario,
  description: "Tailscale CLI availability re-checked without app restart (RuntimeHealthChip)",
  evidenceContract: {
    criteria: [
      {
        id: "runtime-indicator-visible",
        description: "The instance header shows runtime health chips reflecting live state.",
        assertionDescriptions: [
          "The instance header renders with runtime health chips",
          "The runtime health chip reflects the current runtime state as available",
        ],
        captureLabels: ["instance-runtime-health"],
      },
    ],
  },
});

registerScenario({
  changeId: "gh-201-live-log-reconnect",
  runner: gh201LiveLogReconnectScenario,
  description: "Live log SSE reconnection after stream termination",
  evidenceContract: {
    criteria: [
      {
        id: "stream-state-indicator",
        description: "The app shows health chips indicating connected stream state with reconnect support.",
        assertionDescriptions: [
          "The main view renders with instance details and chips",
          "The runtime and daemon health chips indicate a connected state",
          "The StreamStateIndicator supports reconnecting and disconnected states",
        ],
        captureLabels: ["log-following"],
      },
    ],
  },
});

registerScenario({
  changeId: "gh-200-log-tail-no-overwrite",
  runner: gh200LogTailNoOverwriteScenario,
  description: "Initial log tail does not overwrite live SSE lines",
  evidenceContract: {
    criteria: [
      {
        id: "tail-live-merge",
        description: "The app renders correctly with the log tail merge logic intact.",
        assertionDescriptions: [
          "The app renders correctly with the log tail merge logic",
          "The instance detail view shows the environment with chip indicators",
        ],
        captureLabels: ["log-segments"],
      },
    ],
  },
});

registerScenario({
  changeId: "gh-197-sse-multi-line-parser",
  runner: gh197SseMultiLineParserScenario,
  description: "SSE stream parser handles multi-line data values correctly",
  evidenceContract: {
    criteria: [
      {
        id: "sse-no-errors",
        description: "The app renders without SSE parsing errors.",
        assertionDescriptions: [
          "The app renders without SSE parsing errors",
          "The mock app displays infrastructure chat which uses SSE events",
          "No console errors related to SSE parsing",
        ],
        captureLabels: ["sse-log-output"],
      },
    ],
  },
});

registerScenario({
  changeId: "gh-165-stale-config-warning",
  runner: gh165StaleConfigWarningScenario,
  description: "Stale config warning modal with pull-remote and overwrite-anyway options",
  evidenceContract: {
    criteria: [
      {
        id: "stale-modal",
        description: "The stale config warning is accessible from the instance header.",
        assertionDescriptions: [
          "The instance header with main-VM selector is visible (triggers stamp-checked writes)",
          "The main-VM star indicator or set-main-VM button is accessible",
          "The StaleConfigWarning component is defined with Pull remote and Overwrite anyway buttons",
        ],
        captureLabels: ["stale-config-area"],
      },
    ],
  },
});

registerScenario({
  changeId: "gh-164-restore-offer",
  runner: gh164RestoreOfferScenario,
  description: "Pull-canonical restore from config-home with environment names and count",
  evidenceContract: {
    criteria: [
      {
        id: "restore-available",
        description: "The restore offer is accessible from the instance detail view.",
        assertionDescriptions: [
          "The instance detail view is visible where the restore offer would appear",
          "The RestoreOffer component is wired in the App with checkRestoreAvailable",
          "The sidebar shows the instance with connection status",
        ],
        captureLabels: ["restore-offer"],
      },
    ],
  },
});

registerScenario({
  changeId: "gh-163-bootstrap-seed",
  runner: gh163BootstrapSeedScenario,
  description: "Portable bootstrap seed export and import for new machines",
  evidenceContract: {
    criteria: [
      {
        id: "export-seed",
        description: "The InstanceDetail view provides an Export seed button.",
        assertionDescriptions: [
          "The InstanceDetail view shows an Export seed button",
          "Clicking Export seed copies the seed to the clipboard",
        ],
        captureLabels: ["export-seed"],
      },
      {
        id: "import-seed",
        description: "The ColdOpen component provides Import seed when no environments exist.",
        assertionDescriptions: [
          "The ColdOpen component provides an Import seed button when no environments exist",
        ],
        captureLabels: ["cold-open-seed"],
      },
    ],
  },
});

registerScenario({
  changeId: "gh-162-references-not-secrets",
  runner: gh162ReferencesNotSecretsScenario,
  description: "Enforce references-not-secrets in synced config",
  evidenceContract: {
    criteria: [
      {
        id: "no-secrets-in-ui",
        description: "No secret values appear in the UI or serialized config.",
        assertionDescriptions: [
          "The mock config service does not expose secret values in the UI",
          "The credential re-auth prompt uses references not key material",
        ],
        captureLabels: ["config-references"],
      },
    ],
  },
});

registerScenario({
  changeId: "gh-156-chat-infra-bug-cluster",
  runner: gh156ChatInfraBugClusterScenario,
  description: "Chat/InfraChat bug cluster: finishedAt type, no-op approval, memory leak, log flicker",
  evidenceContract: {
    criteria: [
      {
        id: "infra-chat-responds",
        description: "The InfraChatPanel renders and responds to prompts.",
        assertionDescriptions: [
          "The InfraChatPanel renders and responds to prompts",
        ],
        captureLabels: ["infra-chat-response"],
      },
      {
        id: "question-flow-works",
        description: "The question flow renders and resolves correctly.",
        assertionDescriptions: [
          "The question flow renders and resolves correctly",
        ],
        captureLabels: ["question-panel"],
      },
      {
        id: "log-viewer-stable",
        description: "The log viewer renders segments without flickering (stable callback identities).",
        assertionDescriptions: [
          "The log viewer renders segment data without flickering (stable callback identity)",
        ],
        captureLabels: ["log-viewer-stable"],
      },
    ],
  },
});
