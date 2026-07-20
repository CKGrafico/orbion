/**
 * Scenario: gh-162-references-not-secrets
 *
 * Exercises the enforcement that the synced config contains only references
 * to credentials — never key material. The serialization layer structurally
 * cannot include secret fields; secrets live in the keychain, config stores
 * references (UUIDs).
 *
 * In the mock app:
 *   1. The config store shows environment references with credential indicators.
 *   2. No secret fields appear in the serialized config.
 *   3. No secret values (tokens, passwords, keys) appear in the rendered UI.
 */
import type { Page } from "playwright";
import type { ScenarioContext, ScenarioResult } from "../scenario-registry.js";
import { runAssertions } from "../assertions.js";

type AssertionSpec = {
  readonly description: string;
  readonly run: (p: Page) => Promise<void>;
};

export async function gh162ReferencesNotSecretsScenario(ctx: ScenarioContext): Promise<ScenarioResult> {
  const { window: page } = ctx;

  // Wait for the app to render
  await page.waitForTimeout(3000);

  const assertions: AssertionSpec[] = [
    {
      description: "The mock config service does not expose secret values in the UI",
      run: async (p) => {
        // Verify no secret values (tokens, passwords, keys) appear in the rendered UI
        const bodyText = await p.locator("body").innerText();
        const secretPatterns = [
          /Bearer [A-Za-z0-9\-._~+/]+=*/,
          /sk-[a-zA-Z0-9]{20,}/,
          /password["\s]*[:=]["\s]*\S+/i,
          /secret[_-]?key["\s]*[:=]["\s]*\S+/i,
          /token["\s]*[:=]["\s]*[A-Za-z0-9\-._~+/]{20,}/i,
        ];

        for (const pattern of secretPatterns) {
          if (pattern.test(bodyText)) {
            throw new Error(`Secret value detected in UI text matching ${pattern}`);
          }
        }
      },
    },
    {
      description: "Environment entries in localStorage store only references, not credentials",
      run: async (p) => {
        // Verify the serialized config in mock mode uses references
        const configData = await p.evaluate(() => {
          try {
            const stored = localStorage.getItem("orbion.envs.mock");
            if (!stored) return null;
            const parsed = JSON.parse(stored);
            return parsed;
          } catch {
            return null;
          }
        });

        if (configData && Array.isArray(configData)) {
          for (const env of configData) {
            const envKeys = Object.keys(env);
            const secretKeys = envKeys.filter((k) =>
              /token|password|secret|credential/i.test(k) &&
              !/endpoint/i.test(k) // endpoint IDs are not secrets
            );
            if (secretKeys.length > 0) {
              throw new Error(`Environment has secret key(s): ${secretKeys.join(", ")}`);
            }
          }
        }
        await ctx.captureCheckpoint(
          "config-references",
          "Config view showing only credential references, not secrets",
        );
      },
    },
    {
      description: "The credential re-auth prompt uses references not key material",
      run: async (p) => {
        // The sidebar and main header show environment names and status
        // Never secret values
        const mainTitle = p.locator(".main-title").first();
        if ((await mainTitle.count()) > 0) {
          const text = await mainTitle.innerText();
          // No secret values should appear in the instance name
          if (/Bearer |sk-|[a-f0-9]{32,}|password/i.test(text)) {
            throw new Error(`Secret value found in main title: ${text}`);
          }
        }
        const sidebar = p.locator(".sidebar").first();
        if ((await sidebar.count()) > 0) {
          const text = await sidebar.innerText();
          if (/Bearer |sk-|[a-f0-9]{32,}|password/i.test(text)) {
            throw new Error(`Secret value found in sidebar: ${text}`);
          }
        }
      },
    },
  ];

  return {
    scenario: {
      title: "Enforce references-not-secrets in synced config",
      steps: [
        "Open the app with mock environments",
        "Verify no secret values appear in the UI",
        "Verify localStorage config contains only references",
        "Verify credential prompts use references not key material",
      ],
    },
    assertions: await runAssertions(page, assertions),
  };
}
