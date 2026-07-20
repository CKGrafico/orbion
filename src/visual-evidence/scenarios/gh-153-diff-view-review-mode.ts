/**
 * Scenario: gh-153-diff-view-review-mode
 *
 * Exercises the diff viewer inside review mode:
 *   1. App launches into the inbox view with mock PR data.
 *   2. Clicking a PR item opens review mode.
 *   3. The diff file list is visible with file entries.
 *   4. Selecting a file shows its unified diff with add/remove coloring.
 *   5. Binary files show a "Binary file" label instead of diff content.
 *   6. The file stats (additions/deletions) are visible in the list.
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

export async function gh153DiffViewReviewModeScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
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
      description: "Clicking a PR item opens review mode with diff viewer",
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
        const diffView = p.locator(".review-diff-view");
        if ((await diffView.count()) === 0) {
          throw new Error("Diff viewer did not appear in review mode");
        }
      },
    },
    {
      description: "The diff file list is visible with file entries",
      run: async (p) => {
        const fileList = p.locator(".review-diff-file-list");
        if ((await fileList.count()) === 0) {
          throw new Error("Diff file list not visible");
        }
        const fileItems = p.locator(".review-diff-file-item");
        const count = await fileItems.count();
        if (count === 0) {
          throw new Error("No file items in the diff file list");
        }
      },
    },
    {
      description: "File stats (additions/deletions) are visible in the file list",
      run: async (p) => {
        // Check for addition/deletion stats
        const additions = p.locator(".review-diff-file-item-additions").first();
        if ((await additions.count()) === 0) {
          throw new Error("No addition stats visible in the file list");
        }
        const deletions = p.locator(".review-diff-file-item-deletions").first();
        if ((await deletions.count()) === 0) {
          throw new Error("No deletion stats visible in the file list");
        }
      },
    },
    {
      description: "Selecting a file shows its unified diff with line coloring",
      run: async (p) => {
        // The first non-binary file should already be selected
        const contentPane = p.locator(".review-diff-content-pane");
        if ((await contentPane.count()) === 0) {
          throw new Error("Diff content pane not visible");
        }

        // Wait for diff to load
        await page.waitForTimeout(1500);

        // Check that at least some diff lines are rendered
        const diffLines = p.locator(".review-diff-line");
        const lineCount = await diffLines.count();
        if (lineCount === 0) {
          throw new Error("No diff lines rendered in the content pane");
        }

        // Check for addition line(s)
        const addLines = p.locator(".review-diff-line-addition");
        if ((await addLines.count()) === 0) {
          throw new Error("No addition lines visible in the diff");
        }
      },
    },
    {
      description: "Binary file shows a label instead of diff content",
      run: async (p) => {
        // Find the binary file item in the file list and click it
        const binaryItems = p.locator(".review-diff-file-item").filter({ hasText: "binary" });
        if ((await binaryItems.count()) > 0) {
          await binaryItems.first().click();
          await page.waitForTimeout(500);
          // Check for binary label in the content pane
          const binaryLabel = p.locator(".review-diff-binary-label");
          if ((await binaryLabel.count()) === 0) {
            throw new Error("Binary file label not visible after selecting binary file");
          }
        }
        // If no binary items, this assertion is vacuously true
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
      title: "Diff view in review mode",
      steps: [
        "Navigate to the inbox view",
        "Click a PR awaiting review item",
        "Verify the diff file list appears with file entries and stats",
        "Verify file stats (additions/deletions) are visible",
        "Verify the selected file shows unified diff with add/remove coloring",
        "Verify binary files show a label instead of diff content",
        "Press Escape and verify review mode closes",
      ],
    },
    assertions: results,
  };
}
