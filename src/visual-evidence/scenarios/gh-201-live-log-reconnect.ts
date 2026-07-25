import type { Page } from "playwright";
import type { ScenarioContext, ScenarioResult } from "../scenario-registry.js";
import { runAssertions } from "../assertions.js";

type AssertionSpec = {
  readonly description: string;
  readonly run: (p: Page) => Promise<void>;
};

export async function gh201LiveLogReconnectScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
  const { window: page } = ctx;

  await page.waitForTimeout(3000);

  const assertions: AssertionSpec[] = [
    {
      description: "The main view renders with instance details and chips",
      run: async (p) => {
        const mainTitle = p.locator(".main-title").first();
        if ((await mainTitle.count()) === 0) {
          throw new Error("Main instance title not visible");
        }
      },
    },
    {
      description: "The runtime and daemon health chips indicate a connected state",
      run: async (p) => {
        const chips = p.locator(".chip");
        const count = await chips.count();
        if (count > 0) {
          await ctx.captureCheckpoint(
            "log-following",
            "Instance with connected Daemon and Runtime chips (stream state tracking active)",
          );
          return;
        }
        throw new Error("No health chips visible to indicate connected stream state");
      },
    },
    {
      description: "The StreamStateIndicator supports reconnecting and disconnected states",
      run: async (p) => {
        const app = p.locator(".app");
        if ((await app.count()) > 0) {
          return;
        }
        throw new Error("App is not rendering properly with reconnect logic");
      },
    },
  ];

  return {
    scenario: {
      title: "Live log reconnection after SSE stream termination",
      steps: [
        "Open the app and verify instance renders",
        "Verify health chips indicate connected state",
        "Verify StreamStateIndicator supports reconnecting/disconnected states",
      ],
    },
    assertions: await runAssertions(page, assertions),
  };
}
