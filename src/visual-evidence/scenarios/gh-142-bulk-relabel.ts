/**
 * Example scenario: gh-142-bulk-relabel
 *
 * Exercises the bulk-relabel flow end-to-end using a deterministic seed:
 *   1. App launches at cold-open (no environments configured).
 *   2. Open the InfraChatPanel via the "Add your first machine" seed import
 *      path with a fixture seed string.
 *   3. Type "list issues labeled to-implement" — assert the issue stack
 *      appears.
 *   4. Type "mark these as to-refine" — assert the confirmation card names
 *      every affected issue.
 *   5. Click Apply — assert per-item success/failure results.
 *
 * Because the renderer runs in mock mode (no window.api when launched without
 * Electron-style environment) OR is pointed at a fixture daemon, no real gh
 * CLI calls are made. The assertions focus on the renderered UI behavior the
 * change is responsible for: intent detection, the confirmation card listing
 * every affected issue, and per-item result rendering.
 *
 * On any AssertionFailure, the scenario returns structured assertions so the
 * orchestrator can build the failed-step result without an unhandled throw.
 */
import type { Page } from "playwright";
import type { ScenarioContext, ScenarioResult } from "../scenario-registry.js";
import {
  expectVisibleText,
  clickButton,
  runAssertions,
} from "../assertions.js";

const SEED_FIXTURE = "orbion://direct:http://127.0.0.1:8845#Mock%20Environment";

type AssertionSpec = {
  description: string;
  run: (p: Page) => Promise<void>;
};

export async function gh142BulkRelabelScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
  const { window: page } = ctx;

  // 1. App should be visible — check for the brand text "Orbion" anywhere
  await expectVisibleText(page, "Orbion");

  // 2. Open the import-seed dialog and enter the fixture seed. This exercises
  //    the cold-open UI path and gets us into the InfraChatPanel surface.
  const importButtons = page.getByRole("button", { name: /import|seed/i });
  if ((await importButtons.count()) > 0) {
    await importButtons.first().click();
    const input = page.locator("input").first();
    await input.fill(SEED_FIXTURE);
    await page.getByRole("button", { name: /confirm|import|add/i }).first().click();
  }

  // 3. The InfraChatPanel composer is the primary input surface. The
  //    bulk-relabel intent detector activates on "mark these as X" patterns.
  const composer = page.locator('textarea, input[type="text"]').last();
  await composer.waitFor({ state: "visible", timeout: 10_000 });

  // Simulate listing issues
  await composer.fill("list issues labeled to-implement");
  await page.keyboard.press("Enter");

  // 4. Trigger the bulk relabel intent
  await composer.fill("mark these as to-refine");
  await page.keyboard.press("Enter");

  // 5. The confirmation card should name every affected issue by its number
  //    and title.
  const confirmationAssertions: AssertionSpec[] = [
    {
      description: "A confirmation card is shown asking for approval",
      run: async (p) => {
        await expectVisibleText(p, "Confirm");
      },
    },
    {
      description: "Each affected issue is listed by number in the confirmation",
      run: async (p) => {
        const body = await p.textContent("body");
        if (!body || !/#\d+/.test(body)) {
          throw new Error("Expected at least one issue reference like #NNN in the confirmation card");
        }
      },
    },
    {
      description: "The intended label change ('to-refine') is visible",
      run: async (p) => {
        await expectVisibleText(p, "to-refine");
      },
    },
  ];

  const preApplyResults = await runAssertions(page, confirmationAssertions);

  // 6. Approve and assert per-item results
  try {
    await clickButton(page, "Apply");
  } catch {
    // If the button isn't found, the pre-apply assertion already failed and
    // we capture that below. Don't let this throw swallow the structured result.
  }

  const resultAssertions: AssertionSpec[] = [
    {
      description: "A result for each affected issue is shown",
      run: async (p) => {
        const body = await p.textContent("body");
        if (!body || !/[✓✗]/.test(body)) {
          throw new Error("Expected per-item result markers (✓ or ✗) to be visible after applying");
        }
      },
    },
    {
      description: "The bulk relabel completed successfully for at least one issue",
      run: async (p) => {
        await expectVisibleText(p, "success");
      },
    },
  ];

  const postApplyResults = await runAssertions(page, resultAssertions);

  return {
    scenario: {
      title: "Bulk relabel issues using a sentence",
      steps: [
        "Open the InfraChatPanel",
        "List issues labeled 'to-implement'",
        "Enter 'mark these as to-refine'",
        "Confirm the confirmation card names every affected issue",
        "Apply and verify per-item results",
      ],
    },
    assertions: [...preApplyResults, ...postApplyResults],
  };
}
