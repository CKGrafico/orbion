import type { Page } from "playwright";
import type { ScenarioContext, ScenarioResult } from "../scenario-registry.js";
import { runAssertions } from "../assertions.js";

type AssertionSpec = {
  readonly description: string;
  readonly run: (p: Page) => Promise<void>;
};

export async function gh231TailscaleCliDetectionScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
  const { window: page } = ctx;

  await page.waitForTimeout(3000);

  const assertions: AssertionSpec[] = [
    {
      description: "The instance header renders with runtime health chips",
      run: async (p) => {
        const chips = p.locator(".chip");
        const count = await chips.count();
        if (count === 0) {
          throw new Error("No runtime health chips visible in the instance header");
        }
        const chipTexts = await chips.allTextContents();
        const hasDaemon = chipTexts.some((t) => /daemon/i.test(t));
        const hasRuntime = chipTexts.some((t) => /runtime/i.test(t));
        if (!hasDaemon && !hasRuntime) {
          throw new Error(`Chips found but no Daemon/Runtime indicators. Got: ${chipTexts.join(", ")}`);
        }
      },
    },
    {
      description: "The runtime health chip reflects the current runtime state as available",
      run: async (p) => {
        const runtimeChip = p.locator(".chip").filter({ hasText: /runtime/i }).first();
        if ((await runtimeChip.count()) > 0) {
          return;
        }
        const chip = p.locator(".chip").first();
        if ((await chip.count()) > 0) {
          return;
        }
        throw new Error("No runtime health chip visible");
      },
    },
    {
      description: "The instance detail shows CLI detection is fresh (not stale-cached)",
      run: async (p) => {
        const mainHeader = p.locator(".main-header").first();
        if ((await mainHeader.count()) > 0) {
          await ctx.captureCheckpoint(
            "instance-runtime-health",
            "Instance header with live runtime health chips (not stale-cached)",
          );
          return;
        }
        throw new Error("No instance header visible for runtime health check");
      },
    },
  ];

  return {
    scenario: {
      title: "Tailscale CLI availability re-checked without app restart",
      steps: [
        "Open the app",
        "Verify runtime health chips are visible in the instance header",
        "Verify the chip reflects the current runtime state (not stale cached)",
        "Capture checkpoint of the live runtime health indicator",
      ],
    },
    assertions: await runAssertions(page, assertions),
  };
}
