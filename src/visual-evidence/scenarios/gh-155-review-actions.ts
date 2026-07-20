import type { Page } from "playwright";
import type { ScenarioContext, ScenarioResult } from "../scenario-registry.js";
import { expectVisibleText, runAssertions } from "../assertions.js";

type AssertionSpec = {
  readonly description: string;
  readonly run: (page: Page) => Promise<void>;
};

function inboxPrItem(page: Page) {
  return page.locator(".digest-child-item, .inbox-view-item").filter({ hasText: /#/ }).first();
}

export async function gh155ReviewActionsScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
  const { window: page } = ctx;
  await page.getByRole("button", { name: /inbox/i }).first().click();
  const digestHeader = page.locator(".digest-view-item-header").first();
  if ((await digestHeader.count()) > 0) await digestHeader.click();

  const assertions: AssertionSpec[] = [
    {
      description: "Review mode exposes Approve, Request changes, and Open on web actions",
      run: async (currentPage) => {
        const item = inboxPrItem(currentPage);
        if ((await item.count()) === 0) throw new Error("No PR item is available in the inbox");
        await item.click();
        await currentPage.locator(".review-mode-overlay").waitFor({ state: "visible" });
        await currentPage.getByRole("button", { name: "Approve", exact: true }).waitFor();
        await currentPage.getByRole("button", { name: "Request changes", exact: true }).waitFor();
        await currentPage.getByRole("button", { name: "Open on web", exact: true }).waitFor();
        await ctx.captureCheckpoint(
          "review-actions",
          "PR review mode with approve, request changes, and open on web actions",
        );
      },
    },
    {
      description: "Open on web launches the selected pull request URL",
      run: async (currentPage) => {
        const popupPromise = currentPage.context().waitForEvent("page", { timeout: 10_000 });
        await currentPage.getByRole("button", { name: "Open on web", exact: true }).click();
        const popup = await popupPromise;
        if (!popup.url().includes("github.com")) {
          throw new Error(`Unexpected PR URL: ${popup.url()}`);
        }
        await popup.close();
      },
    },
    {
      description: "Request changes requires a comment and marks the PR reviewed",
      run: async (currentPage) => {
        await currentPage.getByRole("button", { name: "Request changes", exact: true }).click();
        const comment = currentPage.locator(".review-mode-comment-input");
        await comment.fill("Please add coverage for the failure path.");
        await ctx.captureCheckpoint(
          "request-changes",
          "Request changes comment ready to submit",
        );
        await currentPage.locator(".review-mode-comment-submit").click();
        await expectVisibleText(currentPage, "Reviewed");
      },
    },
    {
      description: "Approve marks another queued PR reviewed",
      run: async (currentPage) => {
        const nextItem = currentPage.locator(".review-queue-strip-row:not(.review-queue-strip-row-disposed)").last();
        await nextItem.click();
        await currentPage.getByRole("button", { name: "Approve", exact: true }).click();
        await expectVisibleText(currentPage, "Reviewed");
        await ctx.captureCheckpoint(
          "approved",
          "Approved PR marked reviewed in the queue",
        );
      },
    },
  ];

  return {
    scenario: {
      title: "Approve, request changes, and open a PR on the web",
      steps: [
        "Open a PR from the inbox",
        "Verify all review actions are available",
        "Open the PR URL on the web",
        "Request changes with a comment and verify the reviewed state",
        "Approve another queued PR and verify the reviewed state",
      ],
    },
    assertions: await runAssertions(page, assertions),
  };
}
