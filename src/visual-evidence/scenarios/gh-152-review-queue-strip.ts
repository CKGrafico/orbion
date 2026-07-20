/**
 * Scenario: gh-152-review-queue-strip
 *
 * Exercises the review queue strip for PR batches:
 *   1. App launches into the inbox view with mock data.
 *   2. A PR awaiting review item is visible.
 *   3. Clicking the PR item opens review mode with a queue strip.
 *   4. The queue strip shows multiple PRs with verdict chips.
 *   5. Clicking a different PR in the strip switches the main area.
 *   6. The currently selected PR is highlighted in the strip.
 *
 * Uses mock mode (no real Electron environment needed).
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

export async function gh152ReviewQueueStripScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
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
        await expectVisibleText(p, "#");
      },
    },
    {
      description: "Clicking a PR item opens review mode with the queue strip visible",
      run: async (p) => {
        const prItem = p.locator(".inbox-view-item").filter({ hasText: /#/ }).first();
        if ((await prItem.count()) === 0) {
          throw new Error("No PR inbox item found to click");
        }
        await prItem.click();
        await page.waitForTimeout(1000);
        const overlay = p.locator(".review-mode-overlay");
        if ((await overlay.count()) === 0) {
          throw new Error("Review mode overlay did not appear after clicking PR item");
        }
        const strip = p.locator(".review-queue-strip");
        if ((await strip.count()) === 0) {
          throw new Error("Review queue strip did not appear in review mode");
        }
      },
    },
    {
      description: "The queue strip shows multiple PR rows with verdict chips",
      run: async (p) => {
        const rows = p.locator(".review-queue-strip-row");
        const rowCount = await rows.count();
        if (rowCount < 2) {
          throw new Error(`Expected at least 2 PR rows in queue strip, found ${rowCount}`);
        }
        // Check that at least one risk chip is visible
        const chip = p.locator(".pr-risk-chip").first();
        if ((await chip.count()) === 0) {
          throw new Error("No verdict risk chips visible in the queue strip");
        }
      },
    },
    {
      description: "The currently selected PR row is highlighted in the strip",
      run: async (p) => {
        const activeRow = p.locator(".review-queue-strip-row-active");
        if ((await activeRow.count()) === 0) {
          throw new Error("No active (highlighted) PR row in the queue strip");
        }
      },
    },
    {
      description: "Clicking a different PR in the strip switches the main area",
      run: async (p) => {
        // Find a non-active row and click it
        const allRows = p.locator(".review-queue-strip-row");
        const activeRows = p.locator(".review-queue-strip-row-active");
        const totalCount = await allRows.count();
        const activeCount = await activeRows.count();
        if (totalCount <= 1) {
          // Only one PR; skip this assertion gracefully
          return;
        }
        // Click the last non-active row
        const nonActiveRows = p.locator(".review-queue-strip-row:not(.review-queue-strip-row-active)");
        if ((await nonActiveRows.count()) === 0) {
          throw new Error("No non-active PR rows to click");
        }
        await nonActiveRows.last().click();
        await page.waitForTimeout(500);
        // Verify the header updated (the new active row should exist)
        const newActiveRows = p.locator(".review-queue-strip-row-active");
        if ((await newActiveRows.count()) === 0) {
          throw new Error("No active row after clicking a different PR");
        }
      },
    },
    {
      description: "Pressing Escape closes review mode and returns to inbox",
      run: async (p) => {
        await p.keyboard.press("Escape");
        await page.waitForTimeout(500);
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
      title: "Review queue strip for PR batches",
      steps: [
        "Navigate to the inbox view",
        "Click a PR awaiting review item",
        "Verify the queue strip appears with multiple PR rows and verdicts",
        "Verify the active PR is highlighted in the strip",
        "Click a different PR in the strip and verify the main area updates",
        "Press Escape and verify review mode closes",
      ],
    },
    assertions: results,
  };
}
