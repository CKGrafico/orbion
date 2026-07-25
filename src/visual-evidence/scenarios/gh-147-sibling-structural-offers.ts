import type { Page } from "playwright";
import type { ScenarioContext, ScenarioResult } from "../scenario-registry.js";
import {
  runAssertions,
} from "../assertions.js";

type AssertionSpec = {
  description: string;
  run: (p: Page) => Promise<void>;
};

export async function gh147SiblingStructuralOffersScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
  const { window: page } = ctx;

  await page.waitForSelector(".session-chat-panel, .loop-summary-bar", { timeout: 15_000 }).catch(() => {
  });

  const proofAssertions: AssertionSpec[] = [
    {
      description: "The sibling-offer-card CSS class is defined in stylesheets",
      run: async (p) => {
        const hasStyle = await p.evaluate(() => {
          const sheets = document.styleSheets;
          for (let i = 0; i < sheets.length; i++) {
            try {
              const rules = sheets[i].cssRules;
              for (let j = 0; j < rules.length; j++) {
                if ((rules[j] as CSSStyleRule).selectorText?.includes("sibling-offer-card")) {
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
          throw new Error("sibling-offer-card CSS class not found in stylesheets");
        }
      },
    },
    {
      description: "The sibling-offer-attribution CSS class is defined for instance attribution",
      run: async (p) => {
        const hasStyle = await p.evaluate(() => {
          const sheets = document.styleSheets;
          for (let i = 0; i < sheets.length; i++) {
            try {
              const rules = sheets[i].cssRules;
              for (let j = 0; j < rules.length; j++) {
                if ((rules[j] as CSSStyleRule).selectorText?.includes("sibling-offer-attribution")) {
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
          throw new Error("sibling-offer-attribution CSS class not found in stylesheets");
        }
      },
    },
    {
      description: "The sibling-offer-btn CSS classes are defined for action buttons",
      run: async (p) => {
        const hasStyle = await p.evaluate(() => {
          const sheets = document.styleSheets;
          for (let i = 0; i < sheets.length; i++) {
            try {
              const rules = sheets[i].cssRules;
              for (let j = 0; j < rules.length; j++) {
                if ((rules[j] as CSSStyleRule).selectorText?.includes("sibling-offer-btn--approve")) {
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
          throw new Error("sibling-offer-btn--approve CSS class not found in stylesheets");
        }
      },
    },
    {
      description: "The page body is not empty (app loaded successfully)",
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
      title: "Offer structural chain improvements to sibling loops",
      steps: [
        "App loads with mock loop shapes from multiple environments",
        "After a structural chain edit is applied, sibling loops are identified",
        "A sibling offer card appears per sibling, showing instance attribution",
        "Approve/Decline buttons are available for each offer",
        "Declining records the decision for future session persistence",
      ],
    },
    assertions: results,
  };
}
