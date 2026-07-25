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

  await page.waitForTimeout(3000);

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
