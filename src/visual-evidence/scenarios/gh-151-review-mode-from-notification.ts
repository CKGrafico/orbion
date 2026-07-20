/**
 * Scenario: gh-151-review-mode-from-notification
 *
 * Exercises entering review mode from a PR inbox notification:
 *   1. App launches into the inbox view with mock data.
 *   2. A PR awaiting review item is visible.
 *   3. Clicking the PR item opens the review mode overlay.
 *   4. The review mode header shows PR identity (repo, #number).
 *   5. Pressing Escape closes review mode and returns to the inbox.
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

export async function gh151ReviewModeFromNotificationScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
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
      description: "Clicking a PR item opens the review mode overlay",
      run: async (p) => {
        // Find and click a PR inbox item (contains PR icon + title)
        const prItem = p.locator(".inbox-view-item").filter({ hasText: /#/ }).first();
        if ((await prItem.count()) === 0) {
          throw new Error("No PR inbox item found to click");
        }
        await prItem.click();
        await page.waitForTimeout(1000);
        // Verify the review mode overlay is visible
        const overlay = p.locator(".review-mode-overlay");
        if ((await overlay.count()) === 0) {
          throw new Error("Review mode overlay did not appear after clicking PR item");
        }
      },
    },
    {
      description: "Review mode header shows PR identity (repo and number)",
      run: async (p) => {
        const repo = p.locator(".review-mode-repo");
        const number = p.locator(".review-mode-number");
        if ((await repo.count()) === 0) {
          throw new Error("Review mode repo label not found");
        }
        if ((await number.count()) === 0) {
          throw new Error("Review mode number label not found");
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
      title: "Enter review mode from a PR notification",
      steps: [
        "Navigate to the inbox view",
        "Click a PR awaiting review item",
        "Verify the review mode overlay opens with PR identity",
        "Press Escape and verify it closes",
      ],
    },
    assertions: results,
  };
}
