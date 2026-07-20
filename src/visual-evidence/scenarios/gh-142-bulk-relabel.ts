import type { Page } from "playwright";
import type { ScenarioContext, ScenarioResult } from "../scenario-registry.js";
import { expectVisibleText, runAssertions } from "../assertions.js";

type AssertionSpec = {
  readonly description: string;
  readonly run: (page: Page) => Promise<void>;
};

const issueTitles = ["Setup CI pipeline", "Add error boundary", "Implement auth flow"];

async function submitComposer(page: Page, text: string): Promise<void> {
  const composer = page.locator("textarea").last();
  await composer.waitFor({ state: "visible", timeout: 10_000 });
  await composer.fill(text);
  await composer.press("Enter");
}

export async function gh142BulkRelabelScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
  const { window: page } = ctx;
  await expectVisibleText(page, "Infrastructure");

  const assertions: AssertionSpec[] = [
    {
      description: "The requested issue stack is listed with every issue title",
      run: async (currentPage) => {
        await submitComposer(currentPage, "list issues labeled to-implement");
        for (const title of issueTitles) await expectVisibleText(currentPage, title);
      },
    },
    {
      description: "The confirmation names every issue and the to-refine label",
      run: async (currentPage) => {
        await submitComposer(currentPage, "mark these as to-refine");
        await expectVisibleText(currentPage, "Apply these labels to all listed issues?");
        await expectVisibleText(currentPage, "to-refine");
        for (const title of issueTitles) await expectVisibleText(currentPage, title);
        await ctx.captureCheckpoint(
          "confirmation",
          "Bulk relabel confirmation naming every affected issue",
        );
      },
    },
    {
      description: "Applying once reports a result for every issue including partial failure",
      run: async (currentPage) => {
        await currentPage.getByRole("button", { name: /Apply to all/i }).first().click();
        await expectVisibleText(currentPage, "Partially applied");
        await expectVisibleText(currentPage, "2 succeeded, 1 failed");
        await expectVisibleText(currentPage, "Label is protected");
        for (const title of issueTitles) await expectVisibleText(currentPage, title);
        await ctx.captureCheckpoint(
          "result",
          "Bulk relabel per-item results with success and failure",
        );
      },
    },
  ];

  return {
    scenario: {
      title: "Bulk relabel issues using one sentence",
      steps: [
        "List issues labeled to-implement",
        "Enter mark these as to-refine",
        "Verify the confirmation names every affected issue",
        "Apply once",
        "Verify per-item success and failure results",
      ],
    },
    assertions: await runAssertions(page, assertions),
  };
}
