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
import type { AssertionResult, Scenario } from "./types.js";
import { AssertionFailure } from "./assertions.js";
import { gh142BulkRelabelScenario } from "./scenarios/gh-142-bulk-relabel.js";
import { gh146FleetShapedLoopsScenario } from "./scenarios/gh-146-fleet-shaped-loops.js";

export interface ScenarioContext {
  readonly repoRoot: string;
  readonly app: ElectronApplication;
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
