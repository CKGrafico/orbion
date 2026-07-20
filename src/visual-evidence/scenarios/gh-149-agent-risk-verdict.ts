/**
 * Scenario: gh-149-agent-risk-verdict
 *
 * Exercises the PR risk verdict display on inbox items:
 *   1. App launches into the inbox view with mock data.
 *   2. PR inbox items are visible with risk-level chips.
 *   3. At least one risk chip is visible (low/medium/high/uncertain).
 *   4. A verdict text line is present on a PR item.
 *
 * Uses mock mode (no real Electron environment needed). The mock
 * PrVerdictService provides pre-populated verdicts for the 3 mock PRs.
 */
import type { Page } from "playwright";
import type { ScenarioContext, ScenarioResult } from "../scenario-registry.js";
import {
  expectVisibleText,
  runAssertions,
} from "../assertions.js";

type AssertionSpec = {
  description: string;
  run: (p: Page) => Promise<void>;
};

export async function gh149AgentRiskVerdictScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
  const { window: page } = ctx;

  // Wait for the app to render (inbox or cold-open)
  await page.waitForTimeout(3000);

  // Navigate to inbox if not already there
  const inboxTab = page.getByRole("button", { name: /inbox/i });
  if ((await inboxTab.count()) > 0) {
    await inboxTab.first().click();
    await page.waitForTimeout(1000);
  }

  const assertions: AssertionSpec[] = [
    {
      description: "A PR awaiting review item is visible in the inbox",
      run: async (p) => {
        await expectVisibleText(p, "PR awaiting review");
      },
    },
    {
      description: "A risk-level chip is visible on a PR item",
      run: async (p) => {
        const body = await p.textContent("body");
        if (!body) {
          throw new Error("Page body is empty");
        }
        const hasRiskChip = /low|medium|high|uncertain/i.test(body);
        if (!hasRiskChip) {
          throw new Error("Expected at least one risk level chip (low/medium/high/uncertain) on a PR inbox item");
        }
      },
    },
    {
      description: "A verdict text is visible on a PR item (e.g., 'Small change' or 'security-sensitive')",
      run: async (p) => {
        const body = await p.textContent("body");
        if (!body) {
          throw new Error("Page body is empty");
        }
        const hasVerdict = /Small change|security-sensitive|lines across|config files/i.test(body);
        if (!hasVerdict) {
          throw new Error("Expected at least one verdict text on a PR inbox item");
        }
      },
    },
  ];

  const results = await runAssertions(page, assertions);

  return {
    scenario: {
      title: "Agent risk verdict on each PR",
      steps: [
        "Navigate to the inbox view",
        "Verify PR items are visible with risk-level chips",
        "Verify verdict text is shown on PR items",
      ],
    },
    assertions: results,
  };
}
