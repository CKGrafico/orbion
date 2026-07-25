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

export async function gh157CrossPrOverlapDetectionScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
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
        await page.waitForTimeout(2000);
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
      description: "The queue strip shows overlap indicator chips on affected PRs",
      run: async (p) => {
        // Wait for async diff fetching to complete
        await page.waitForTimeout(3000);
        const overlapChip = p.locator(".review-queue-strip-row-overlap");
        const count = await overlapChip.count();
        if (count === 0) {
          throw new Error("No overlap indicator chips visible in the queue strip (expected at least PRs #127 and #131 to overlap)");
        }
      },
    },
    {
      description: "The review order banner appears when overlaps are detected",
      run: async (p) => {
        const banner = p.locator(".review-order-banner");
        const count = await banner.count();
        if (count === 0) {
          throw new Error("Review order banner not visible despite detected overlaps");
        }
      },
    },
    {
      description: "The briefing view shows file-level overlap notes on shared files",
      run: async (p) => {
        const briefingBtn = p.locator(".review-mode-tab-btn").filter({ hasText: /briefing/i });
        if ((await briefingBtn.count()) > 0) {
          await briefingBtn.click();
          await page.waitForTimeout(1000);
        }
        const fileOverlapNote = p.locator(".review-briefing-file-overlap-note");
        const count = await fileOverlapNote.count();
        if (count === 0) {
          const row127 = p.locator(".review-queue-strip-row").filter({ hasText: /127/ });
          if ((await row127.count()) > 0) {
            await row127.click();
            await page.waitForTimeout(1500);
          }
          const retryCount = await fileOverlapNote.count();
          if (retryCount === 0) {
            throw new Error("No file-level overlap notes visible in the briefing view for shared files");
          }
        }
      },
    },
  ];

  const results = await runAssertions(page, assertions);

  return {
    scenario: {
      title: "Cross-PR conflict and overlap detection in a batch",
      steps: [
        "Navigate to the inbox view",
        "Click a PR awaiting review item to enter review mode",
        "Verify the queue strip shows overlap indicator chips on affected PRs",
        "Verify the review order banner appears when overlaps exist",
        "Verify the briefing view shows file-level overlap notes on shared files",
      ],
    },
    assertions: results,
  };
}
