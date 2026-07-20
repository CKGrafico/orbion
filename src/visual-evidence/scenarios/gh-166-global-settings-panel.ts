/**
 * Scenario: gh-166-global-settings-panel
 *
 * Exercises the Global Settings Panel: a deliberately thin settings surface
 * opened from the sidebar gear icon containing 5 app-wide options:
 * theme, default agent runtime, config-home VM, notification mute,
 * ephemeral threshold.
 *
 * In the mock app, the settings panel opens when the gear icon in the
 * sidebar footer is clicked.
 */
import type { Page } from "playwright";
import type { ScenarioContext, ScenarioResult } from "../scenario-registry.js";
import { runAssertions } from "../assertions.js";

type AssertionSpec = {
  readonly description: string;
  readonly run: (p: Page) => Promise<void>;
};

export async function gh166GlobalSettingsPanelScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
  const { window: page } = ctx;

  // Wait for the app to render
  await page.waitForTimeout(3000);

  const assertions: AssertionSpec[] = [
    {
      description: "The sidebar footer contains a settings gear icon",
      run: async (p) => {
        const sidebarFooter = p.locator(".sidebar-footer").first();
        if ((await sidebarFooter.count()) === 0) {
          throw new Error("Sidebar footer not visible");
        }
        // The settings button is in the sidebar footer
        const settingsBtn = sidebarFooter.locator("button").last();
        if ((await settingsBtn.count()) === 0) {
          throw new Error("Settings gear button not found in sidebar footer");
        }
      },
    },
    {
      description: "Clicking the gear icon opens the settings drawer",
      run: async (p) => {
        const sidebarFooter = p.locator(".sidebar-footer").first();
        // The settings button should be the gear (last button before OrbionMark)
        const settingsBtn = sidebarFooter.locator("button").last();
        await settingsBtn.click();
        await page.waitForTimeout(500);

        const drawer = p.locator(".settings-drawer").first();
        if ((await drawer.count()) === 0) {
          throw new Error("Settings drawer did not open after clicking gear icon");
        }

        await ctx.captureCheckpoint(
          "settings-panel-open",
          "Global Settings Panel opened from sidebar gear icon",
        );
      },
    },
    {
      description: "The settings panel contains all 5 settings rows",
      run: async (p) => {
        const drawer = p.locator(".settings-drawer").first();
        if ((await drawer.count()) === 0) {
          throw new Error("Settings drawer not visible");
        }

        // Verify the settings rows exist
        const rows = drawer.locator(".settings-row");
        const rowCount = await rows.count();
        if (rowCount < 5) {
          throw new Error(`Expected at least 5 settings rows, found ${rowCount}`);
        }
      },
    },
    {
      description: "Theme setting shows Dark as the active segment",
      run: async (p) => {
        const drawer = p.locator(".settings-drawer").first();
        const activeThemeSegment = drawer.locator(".segment.active").first();
        if ((await activeThemeSegment.count()) === 0) {
          throw new Error("No active theme segment found");
        }
        const text = await activeThemeSegment.textContent();
        if (!text?.includes("Dark")) {
          throw new Error(`Expected 'Dark' as active theme, got '${text}'`);
        }
      },
    },
    {
      description: "Notification mute toggle is present",
      run: async (p) => {
        const drawer = p.locator(".settings-drawer").first();
        const toggle = drawer.locator(".settings-toggle").first();
        if ((await toggle.count()) === 0) {
          throw new Error("Notification mute toggle not found");
        }
      },
    },
    {
      description: "Closing the settings drawer hides it",
      run: async (p) => {
        const drawer = p.locator(".settings-drawer").first();
        const closeBtn = drawer.locator(".settings-header button").first();
        await closeBtn.click();
        await page.waitForTimeout(300);

        const drawerAfter = p.locator(".settings-drawer").first();
        if ((await drawerAfter.count()) > 0 && (await drawerAfter.isVisible())) {
          throw new Error("Settings drawer still visible after clicking close");
        }
      },
    },
  ];

  return {
    scenario: {
      title: "Global settings panel (deliberately thin)",
      steps: [
        "Verify sidebar footer has gear icon",
        "Click gear to open settings drawer",
        "Verify all 5 settings rows are present",
        "Verify Dark theme is the active segment",
        "Verify notification mute toggle exists",
        "Close the settings drawer",
      ],
    },
    assertions: await runAssertions(page, assertions),
  };
}
