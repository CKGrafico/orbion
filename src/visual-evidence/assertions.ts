/**
 * Assertion helpers for visual-evidence scenarios.
 *
 * All helpers use accessible selectors (roles, text, labels) and Playwright's
 * built-in auto-waiting. Avoid brittle fixed sleeps: use {@link expectVisibleText}
 * / {@link expectEnabled} which poll until the assertion holds or the timeout
 * fires.
 *
 * Each assertion returns void on success and throws an {@link AssertionFailure}
 * with a human-readable description on failure. The orchestrator (run.ts)
 * catches these to build the failed-step result.
 */
import { expect as pwExpect } from "playwright";

export class AssertionFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertionFailure";
  }
}

export interface AssertOpts {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT = 15_000;

export async function expectVisibleText(
  page: import("playwright").Page,
  text: string,
  opts: AssertOpts = {},
): Promise<void> {
  try {
    await pwExpect(page.getByText(text, { exact: false }).first()).toBeVisible({
      timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT,
    });
  } catch {
    throw new AssertionFailure(`Expected visible text: ${JSON.stringify(text)}`);
  }
}

export async function expectHeading(
  page: import("playwright").Page,
  text: string,
  opts: AssertOpts = {},
): Promise<void> {
  try {
    await pwExpect(
      page.getByRole("heading", { name: text, exact: false }).first(),
    ).toBeVisible({ timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT });
  } catch {
    throw new AssertionFailure(`Expected visible heading: ${JSON.stringify(text)}`);
  }
}

export async function expectButton(
  page: import("playwright").Page,
  name: string,
  opts: AssertOpts = {},
): Promise<void> {
  try {
    await pwExpect(
      page.getByRole("button", { name, exact: false }).first(),
    ).toBeVisible({ timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT });
  } catch {
    throw new AssertionFailure(`Expected button with name: ${JSON.stringify(name)}`);
  }
}

export async function expectEnabled(
  page: import("playwright").Page,
  name: string,
  opts: AssertOpts = {},
): Promise<void> {
  try {
    const locator = page.getByRole("button", { name, exact: false }).first();
    await pwExpect(locator).toBeEnabled({ timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT });
  } catch {
    throw new AssertionFailure(`Expected enabled button: ${JSON.stringify(name)}`);
  }
}

export async function expectDialogOpen(
  page: import("playwright").Page,
  role: "dialog" | "alertdialog" | "alert" = "dialog",
  opts: AssertOpts = {},
): Promise<void> {
  try {
    await pwExpect(page.getByRole(role).first()).toBeVisible({
      timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT,
    });
  } catch {
    throw new AssertionFailure(`Expected a ${role} to be open`);
  }
}

export async function expectListItem(
  page: import("playwright").Page,
  text: string,
  opts: AssertOpts = {},
): Promise<void> {
  try {
    await pwExpect(
      page.getByRole("listitem").filter({ hasText: text }).first(),
    ).toBeVisible({ timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT });
  } catch {
    throw new AssertionFailure(`Expected a list item with text: ${JSON.stringify(text)}`);
  }
}

export async function expectElementByTestId(
  page: import("playwright").Page,
  testId: string,
  opts: AssertOpts = {},
): Promise<void> {
  try {
    await pwExpect(page.getByTestId(testId).first()).toBeVisible({
      timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT,
    });
  } catch {
    throw new AssertionFailure(`Expected element with data-testid: ${JSON.stringify(testId)}`);
  }
}

export async function clickButton(
  page: import("playwright").Page,
  name: string,
): Promise<void> {
  await page.getByRole("button", { name, exact: false }).first().click();
}

export async function fillInput(
  page: import("playwright").Page,
  label: string,
  value: string,
): Promise<void> {
  await page.getByLabel(label, { exact: false }).first().fill(value);
}

export async function pressKey(
  page: import("playwright").Page,
  key: string,
): Promise<void> {
  await page.keyboard.press(key);
}

/**
 * Run a list of named assertion functions and return per-item results
 * instead of throwing on the first failure. Useful when the scenario wants
 * to gather multiple assertion outcomes before reporting.
 */
export async function runAssertions(
  page: import("playwright").Page,
  assertions: ReadonlyArray<{ description: string; run: (p: import("playwright").Page) => Promise<void> }>,
): Promise<Array<{ description: string; status: "passed" | "failed"; error?: string }>> {
  const results: Array<{ description: string; status: "passed" | "failed"; error?: string }> = [];
  for (const a of assertions) {
    try {
      await a.run(page);
      results.push({ description: a.description, status: "passed" });
    } catch (err) {
      results.push({
        description: a.description,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}
