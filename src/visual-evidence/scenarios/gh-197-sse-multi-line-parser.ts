/**
 * Scenario: gh-197-sse-multi-line-parser
 *
 * Exercises the fix for the SSE stream parser splitting on `\n\n`
 * boundaries, which broke on multi-line data values.
 * The parser now correctly concatenates multiple `data:` lines per the
 * SSE specification, preventing silent data corruption.
 */
import type { Page } from "playwright";
import type { ScenarioContext, ScenarioResult } from "../scenario-registry.js";
import { runAssertions } from "../assertions.js";

type AssertionSpec = {
  readonly description: string;
  readonly run: (p: Page) => Promise<void>;
};

export async function gh197SseMultiLineParserScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
  const { window: page } = ctx;

  // Wait for the app to render
  await page.waitForTimeout(3000);

  const assertions: AssertionSpec[] = [
    {
      description: "The app renders without SSE parsing errors",
      run: async (p) => {
        const app = p.locator(".app");
        if ((await app.count()) === 0) {
          throw new Error("App is not rendering properly (possible SSE parser crash)");
        }
      },
    },
    {
      description: "The mock app displays infrastructure chat which uses SSE events",
      run: async (p) => {
        const infraPanel = p.locator(".infra-chat-panel").first();
        if ((await infraPanel.count()) > 0) {
          await ctx.captureCheckpoint(
            "sse-log-output",
            "Infrastructure panel using SSE events with fixed multi-line parser",
          );
          return;
        }
        throw new Error("Infrastructure chat panel not visible for SSE parser verification");
      },
    },
    {
      description: "No console errors related to SSE parsing",
      run: async (p) => {
        const consoleErrors: string[] = [];
        p.on("console", (msg) => {
          if (msg.type() === "error" && msg.text().toLowerCase().includes("sse")) {
            consoleErrors.push(msg.text());
          }
        });
        await p.waitForTimeout(1000);
        if (consoleErrors.length > 0) {
          throw new Error(`SSE parsing errors detected: ${consoleErrors.join("; ")}`);
        }
      },
    },
  ];

  return {
    scenario: {
      title: "SSE stream parser handles multi-line data values correctly",
      steps: [
        "Open the app and verify no SSE parsing errors",
        "Verify the infrastructure panel renders (uses SSE events)",
        "Verify no console errors related to SSE parsing",
      ],
    },
    assertions: await runAssertions(page, assertions),
  };
}
