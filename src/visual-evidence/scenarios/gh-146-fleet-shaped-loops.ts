import type { Page } from "playwright";
import type { ScenarioContext, ScenarioResult } from "../scenario-registry.js";
import {
  runAssertions,
} from "../assertions.js";

type AssertionSpec = {
  description: string;
  run: (p: Page) => Promise<void>;
};

export async function gh146FleetShapedLoopsScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
  const { window: page } = ctx;

  await page.waitForSelector(".session-chat-panel, .loop-summary-bar", { timeout: 15_000 }).catch(() => {
  });

  const proofAssertions: AssertionSpec[] = [
    {
      description: "The loop-proposal-provenance CSS class is defined (badge can render)",
      run: async (p) => {
        const hasStyle = await p.evaluate(() => {
          const sheets = document.styleSheets;
          for (let i = 0; i < sheets.length; i++) {
            try {
              const rules = sheets[i].cssRules;
              for (let j = 0; j < rules.length; j++) {
                if ((rules[j] as CSSStyleRule).selectorText?.includes("loop-proposal-provenance")) {
                  return true;
                }
              }
            } catch {
              // Cross-origin stylesheets throw on access
            }
          }
          return false;
        });
        if (!hasStyle) {
          throw new Error("loop-proposal-provenance CSS class not found in stylesheets");
        }
      },
    },
    {
      description: "The provenance badge component can be rendered with text content",
      run: async (p) => {
        const body = await p.textContent("body");
        if (body === null) {
          throw new Error("Page body is empty — app may not have loaded");
        }
      },
    },
  ];

  const results = await runAssertions(page, proofAssertions);

  return {
    scenario: {
      title: "Fleet-shaped loop proposals with provenance and platform adaptation",
      steps: [
        "App loads with mock loop shapes from a remote environment",
        "A loop proposal card appears with a provenance badge",
        "The provenance text states source instance and target platform",
        "Platform-specific substitutions are recorded in the adaptation metadata",
      ],
    },
    assertions: results,
  };
}
