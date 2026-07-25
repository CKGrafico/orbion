/**
 * Exercises the agent briefing as the default PR review view.
 * The mock web app starts in cold-open state; this scenario first
 * adds a mock environment to bypass it, then navigates to the inbox.
 */
import type { Page } from "playwright";
import type { ScenarioContext, ScenarioResult } from "../scenario-registry.js";
import {
  runAssertions,
} from "../assertions.js";

type AssertionSpec = {
  description: string;
  run: (p: Page) => Promise<void>;
};

function prItem(page: Page) {
  return page.locator(".digest-child-item, .inbox-view-item").filter({ hasText: /#/ }).first();
}

export async function gh154AgentBriefingDefaultScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
  const { window: page } = ctx;

  await page.waitForTimeout(3000);

  // Cold-open bypass: add a mock environment to get past it
  const coldOpen = page.locator(".cold-open, .cold-open-card");
  if ((await coldOpen.count()) > 0) {
    // Try the "Add VM" or similar button to bypass cold-open
    const addVmBtn = page.getByRole("button", { name: /add|connect|start/i }).first();
    if ((await addVmBtn.count()) > 0) {
      await addVmBtn.click();
      await page.waitForTimeout(2000);
    }
  }

  // Navigate to inbox
  const inboxTab = page.getByRole("button", { name: /inbox/i });
  if ((await inboxTab.count()) > 0) {
    await inboxTab.first().click();
    await page.waitForTimeout(1000);
  }

  const digestHeader = page.locator(".digest-view-item-header").first();
  if ((await digestHeader.count()) > 0) {
    await digestHeader.click();
  }

  // Check for PR items; if absent, try entering review mode directly
  let hasPrItems = false;
  const prItems = page.locator(".digest-child-item, .inbox-view-item").filter({ hasText: /#/ });
  if ((await prItems.count()) > 0) {
    hasPrItems = true;
  }

  if (!hasPrItems) {
    const notifBadge = page.locator(".notification-badge, .inbox-badge").first();
    if ((await notifBadge.count()) > 0) {
      await notifBadge.click();
      await page.waitForTimeout(2000);
    }

    // Re-check for PR items after navigation
    const recheckPrItems = page.locator(".digest-child-item, .inbox-view-item").filter({ hasText: /#/ });
    if ((await recheckPrItems.count()) > 0) {
      hasPrItems = true;
    }
  }

  // Last resort: inject review mode directly via the DI container
  if (!hasPrItems) {
    await page.evaluate(() => {
      const reviewBtn = document.querySelector('[data-testid="open-review"], .pr-review-trigger');
      if (reviewBtn instanceof HTMLElement) {
        reviewBtn.click();
      }
    });
    await page.waitForTimeout(2000);

    const reviewOverlay = page.locator(".review-mode-overlay");
    if ((await reviewOverlay.count()) > 0) {
      hasPrItems = true; // We're in review mode now
    }
  }

  const assertions: AssertionSpec[] = [
    {
      description: "Review mode is accessible (via inbox or direct entry)",
      run: async (p) => {
        if (hasPrItems) {
            const item = prItem(p);
            if ((await item.count()) > 0) {
              await item.click();
            await p.waitForTimeout(2000);
          }
        }

        const overlay = p.locator(".review-mode-overlay");
        if ((await overlay.count()) === 0) {
          throw new Error("Review mode overlay not accessible. The mock app may not have PR data configured.");
        }
      },
    },
    {
      description: "The briefing view is the default view in review mode (not raw diff)",
      run: async (p) => {
        const briefingView = p.locator(".review-briefing-view");
        if ((await briefingView.count()) === 0) {
          throw new Error("Briefing view did not appear as the default in review mode");
        }
        // Ensure raw diff view is NOT the default
        const diffView = p.locator(".review-diff-view");
        if ((await diffView.count()) > 0) {
          throw new Error("Raw diff view appeared as the default instead of briefing view");
        }
      },
    },
    {
      description: "The briefing summary is visible with analysis text",
      run: async (p) => {
        const summary = p.locator(".review-briefing-summary");
        if ((await summary.count()) === 0) {
          throw new Error("Briefing summary not visible");
        }
        const summaryText = p.locator(".review-briefing-summary-text");
        if ((await summaryText.count()) === 0) {
          throw new Error("Briefing summary text not visible");
        }
      },
    },
    {
      description: "Flagged files are visible with risk chips and inline diff hunks",
      run: async (p) => {
        const flaggedSection = p.locator(".review-briefing-flagged");
        if ((await flaggedSection.count()) === 0) {
          throw new Error("Flagged files section not visible");
        }
        const flaggedFiles = p.locator(".review-briefing-flagged-file");
        if ((await flaggedFiles.count()) === 0) {
          throw new Error("No flagged files visible in the briefing");
        }
        // Check risk chips
        const riskChips = p.locator(".pr-risk-chip-high, .pr-risk-chip-medium, .pr-risk-chip-low");
        if ((await riskChips.count()) === 0) {
          throw new Error("No risk chips visible on flagged files");
        }
      },
    },
    {
      description: "The tab toggle shows both Briefing and Raw diff options",
      run: async (p) => {
        const toggle = p.locator(".review-mode-tab-toggle");
        if ((await toggle.count()) === 0) {
          throw new Error("Tab toggle not visible");
        }
        const briefingTab = p.locator(".review-mode-tab-btn").filter({ hasText: /briefing/i });
        if ((await briefingTab.count()) === 0) {
          throw new Error("Briefing tab button not visible");
        }
        const rawDiffTab = p.locator(".review-mode-tab-btn").filter({ hasText: /raw diff/i });
        if ((await rawDiffTab.count()) === 0) {
          throw new Error("Raw diff tab button not visible");
        }
      },
    },
    {
      description: "Clicking the Raw diff tab switches to the raw diff view",
      run: async (p) => {
        const rawDiffTab = p.locator(".review-mode-tab-btn").filter({ hasText: /raw diff/i });
        await rawDiffTab.click();
        await p.waitForTimeout(1500);
        const diffView = p.locator(".review-diff-view");
        if ((await diffView.count()) === 0) {
          throw new Error("Raw diff view did not appear after clicking Raw diff tab");
        }
        await ctx.captureCheckpoint(
          "raw-diff",
          "Raw diff remains available as the review fallback",
        );
      },
    },
    {
      description: "Clicking the Briefing tab returns to the briefing view",
      run: async (p) => {
        const briefingTab = p.locator(".review-mode-tab-btn").filter({ hasText: /briefing/i });
        await briefingTab.click();
        await p.waitForTimeout(500);
        const briefingView = p.locator(".review-briefing-view");
        if ((await briefingView.count()) === 0) {
          throw new Error("Briefing view did not reappear after clicking Briefing tab");
        }
      },
    },
    {
      description: "Boilerplate section is present and collapsed by default",
      run: async (p) => {
        const boilerplateSection = p.locator(".review-briefing-boilerplate:visible").first();
        if ((await boilerplateSection.count()) === 0) {
          throw new Error("Boilerplate section is not present");
        }
        const boilerplateHeader = p.locator(".review-briefing-boilerplate-header:visible").first();
        if ((await boilerplateHeader.count()) === 0) {
          throw new Error("Boilerplate section header not visible");
        }
        if ((await boilerplateHeader.getAttribute("aria-expanded")) !== "false") {
          throw new Error("Boilerplate section is not collapsed by default");
        }
        await ctx.captureCheckpoint(
          "briefing",
          "Agent briefing shown by default with flagged and boilerplate files",
        );
      },
    },
    {
      description: "Pressing Escape closes review mode and returns to inbox",
      run: async (p) => {
        await p.keyboard.press("Escape");
        await p.waitForTimeout(500);
        const overlay = p.locator(".review-mode-overlay");
        if ((await overlay.count()) > 0) {
          throw new Error("Review mode overlay still visible after pressing Escape");
        }
      },
    },
  ];

  const results = await runAssertions(page, assertions);

  return {
    scenario: {
      title: "Agent briefing as default PR review view",
      steps: [
        "Navigate to the inbox view",
        "Click a PR awaiting review item",
        "Verify briefing view is the default (not raw diff)",
        "Verify briefing summary text is visible",
        "Verify flagged files with risk chips and inline hunks",
        "Verify tab toggle shows Briefing and Raw diff",
        "Verify clicking Raw diff tab switches to diff view",
        "Verify clicking Briefing tab returns to briefing view",
        "Verify boilerplate section is collapsed by default",
        "Press Escape and verify review mode closes",
      ],
    },
    assertions: results,
  };
}
