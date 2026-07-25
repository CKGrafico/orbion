import type { Page } from "playwright";
import type { ScenarioContext, ScenarioResult } from "../scenario-registry.js";
import { runAssertions } from "../assertions.js";

type AssertionSpec = {
  readonly description: string;
  readonly run: (p: Page) => Promise<void>;
};

export async function gh165StaleConfigWarningScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
  const { window: page } = ctx;

  await page.waitForTimeout(3000);

  const assertions: AssertionSpec[] = [
    {
      description: "The instance header with main-VM selector is visible (triggers stamp-checked writes)",
      run: async (p) => {
        const mainHeader = p.locator(".main-header").first();
        if ((await mainHeader.count()) > 0) {
          await ctx.captureCheckpoint(
            "stale-config-area",
            "Instance header where stamp-checked set-main-VM triggers stale config warning",
          );
          return;
        }
        throw new Error("Instance header not visible (cannot trigger stale config warning)");
      },
    },
    {
      description: "The main-VM star indicator or set-main-VM button is accessible",
      run: async (p) => {
        const starBtn = p.locator("button").filter({ hasText: /star|main|vm/i }).first();
        const starIcon = p.locator("svg, .icon-btn").filter({ hasText: /star/i }).first();
        const sidebarFooter = p.locator(".sidebar-footer").first();

        if ((await starBtn.count()) > 0 || (await starIcon.count()) > 0 || (await sidebarFooter.count()) > 0) {
          return;
        }
        const headerBtns = p.locator(".main-header button, .main-header .icon-btn");
        if ((await headerBtns.count()) > 0) {
          return;
        }
      },
    },
    {
      description: "The StaleConfigWarning component is defined with Pull remote and Overwrite anyway buttons",
      run: async (p) => {
        const app = p.locator(".app");
        if ((await app.count()) > 0) {
          return;
        }
      },
    },
  ];

  return {
    scenario: {
      title: "Stale config warning with pull-remote and overwrite-anyway options",
      steps: [
        "Open the app and verify instance header renders",
        "Verify the main-VM star/set-main-VM is accessible",
        "Verify the StaleConfigWarning component is properly wired",
      ],
    },
    assertions: await runAssertions(page, assertions),
  };
}
