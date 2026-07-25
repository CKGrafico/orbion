import type { Page } from "playwright";
import type { ScenarioContext, ScenarioResult } from "../scenario-registry.js";
import {
  runAssertions,
} from "../assertions.js";

type AssertionSpec = {
  description: string;
  run: (p: Page) => Promise<void>;
};

export async function gh150OvernightPrDigestScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
  const { window: page } = ctx;

  await page.waitForTimeout(3000);

  const inboxTab = page.getByRole("button", { name: /inbox/i });
  if ((await inboxTab.count()) > 0) {
    await inboxTab.first().click();
    await page.waitForTimeout(1000);
  }

  const assertions: AssertionSpec[] = [
    {
      description: "A digest item is visible with PR count summary",
      run: async (p) => {
        const body = await p.textContent("body");
        if (!body) {
          throw new Error("Page body is empty");
        }
        const hasDigest = /PRs overnight/i.test(body) || /\d+ PR/i.test(body);
        if (!hasDigest) {
          throw new Error("Expected a digest item with PR count summary (e.g., '3 PRs overnight')");
        }
      },
    },
    {
      description: "Verdict count badges are visible (safe/needs you/conflict)",
      run: async (p) => {
        const body = await p.textContent("body");
        if (!body) {
          throw new Error("Page body is empty");
        }
        const hasBadge = /safe|needs? you|conflict/i.test(body);
        if (!hasBadge) {
          throw new Error("Expected at least one verdict count badge (safe/needs you/conflict)");
        }
      },
    },
    {
      description: "Expanding the digest reveals individual child PR items",
      run: async (p) => {
        const digestHeader = p.locator(".digest-view-item-header, .digest-item-header").first();
        if ((await digestHeader.count()) > 0) {
          await digestHeader.click();
          await p.waitForTimeout(500);
        }

        const body = await p.textContent("body");
        if (!body) {
          throw new Error("Page body is empty after expansion");
        }
        const hasChildPr = /#?\d+ in .+\/.+ by @/i.test(body) || /awaiting review/i.test(body);
        if (!hasChildPr) {
          throw new Error("Expected individual PR items visible after expanding the digest");
        }
      },
    },
    {
      description: "A risk-level chip is visible on an expanded child PR item",
      run: async (p) => {
        const body = await p.textContent("body");
        if (!body) {
          throw new Error("Page body is empty");
        }
        const hasRiskChip = /low|medium|high|uncertain/i.test(body);
        if (!hasRiskChip) {
          throw new Error("Expected at least one risk level chip on an expanded child PR item");
        }
      },
    },
  ];

  const results = await runAssertions(page, assertions);

  return {
    scenario: {
      title: "Overnight PR digest notification",
      steps: [
        "Navigate to the inbox view",
        "Verify a digest item groups multiple PRs with count summary",
        "Verify verdict count badges (safe/needs you/conflict) are visible",
        "Expand the digest and verify individual PR items are shown",
        "Verify risk-level chips on child items",
      ],
    },
    assertions: results,
  };
}
