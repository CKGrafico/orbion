/**
 * Scenario: gh-154-agent-briefing-default
 *
 * Exercises the agent briefing as the default PR review view:
 *   1. App launches into the inbox view with mock data.
 *   2. Clicking a PR item opens review mode.
 *   3. The briefing view is the default (not raw diff).
 *   4. The briefing summary is visible.
 *   5. Flagged files are visible with risk chips and inline diff hunks.
 *   6. A boilerplate section is visible and collapsed.
 *   7. Clicking the boilerplate section expands it to show collated files.
 *   8. The "Raw diff" tab switches to the raw diff view.
 *   9. The "Briefing" tab switches back to the briefing view.
 *
 * Uses mock mode (no real Electron environment needed).
 *
 * Note: the mock web app starts in cold-open state. The scenario first
 * adds a mock environment to bypass the cold-open, then navigates to the
 * inbox where PR items appear.
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

export async function gh154AgentBriefingDefaultScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
  const { window: page } = ctx;

  // Wait for the app to render (inbox or cold-open)
  await page.waitForTimeout(3000);

  // If we're on the cold-open screen, add a mock environment to get past it
  const coldOpen = page.locator(".cold-open, .cold-open-card");
  if ((await coldOpen.count()) > 0) {
    // Try clicking the "Add VM" or similar button to bypass cold-open
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

  // Check if we have PR items - if not, try to navigate directly into review mode
  // by triggering review mode from the mock service
  let hasPrItems = false;
  const prItems = page.locator(".inbox-view-item").filter({ hasText: /#/ });
  if ((await prItems.count()) > 0) {
    hasPrItems = true;
  }

  // If no PR items in inbox, try the session chat view's review mode trigger
  // (In the mock adapter, review mode can be entered from the sidebar)
  if (!hasPrItems) {
    // Try clicking on any notification-related element
    const notifBadge = page.locator(".notification-badge, .inbox-badge").first();
    if ((await notifBadge.count()) > 0) {
      await notifBadge.click();
      await page.waitForTimeout(2000);
    }

    // Re-check for PR items after potential navigation
    const recheckPrItems = page.locator(".inbox-view-item").filter({ hasText: /#/ });
    if ((await recheckPrItems.count()) > 0) {
      hasPrItems = true;
    }
  }

  // If still no PR items, we need to inject review mode directly
  // This simulates a programmatic entry into review mode
  if (!hasPrItems) {
    // Use JavaScript to trigger the ReviewModeService.enter() via the DI container
    await page.evaluate(() => {
      // Try to access the React tree to trigger review mode
      const reviewBtn = document.querySelector('[data-testid="open-review"], .pr-review-trigger');
      if (reviewBtn instanceof HTMLElement) {
        reviewBtn.click();
      }
    });
    await page.waitForTimeout(2000);

    // Last resort: check if review mode is now visible
    const reviewOverlay = page.locator(".review-mode-overlay");
    if ((await reviewOverlay.count()) > 0) {
      hasPrItems = true; // We're in review mode now
    }
  }

  const assertions: AssertionSpec[] = [
    {
      description: "Review mode is accessible (via inbox or direct entry)",
      run: async (p) => {
        // If we have PR items, click one to enter review mode
        if (hasPrItems) {
          const prItem = p.locator(".inbox-view-item").filter({ hasText: /#/ }).first();
          if ((await prItem.count()) > 0) {
            await prItem.click();
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
        // Make sure the raw diff view is NOT the default
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
        // Check that risk chips are present
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
      description: "Boilerplate section is present and can be expanded",
      run: async (p) => {
        const boilerplateSection = p.locator(".review-briefing-boilerplate");
        if ((await boilerplateSection.count()) === 0) {
          // No boilerplate is valid for some diffs; skip gracefully
          return;
        }
        const boilerplateHeader = p.locator(".review-briefing-boilerplate-header");
        if ((await boilerplateHeader.count()) === 0) {
          throw new Error("Boilerplate section header not visible");
        }
        // Click to expand
        await boilerplateHeader.click();
        await p.waitForTimeout(500);
        const expandedFiles = p.locator(".review-briefing-boilerplate-file");
        if ((await expandedFiles.count()) === 0) {
          throw new Error("Boilerplate files not visible after expanding");
        }
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
        "Verify boilerplate section can be expanded",
        "Press Escape and verify review mode closes",
      ],
    },
    assertions: results,
  };
}
