import { execFile } from "node:child_process";
import type { I18nMessage } from "../shared/ipc.js";
import { msg } from "./i18n.js";

// ── CLI availability & auth check ──────────────────────────────────────

export interface CliCheckResult {
  cli: "gh" | "az";
  authenticated: boolean;
  error?: string;
}

/**
 * Check which platform CLI is available and whether it's authenticated.
 *
 * Strategy: try `gh auth status` first; if `gh` isn't installed (ENOENT),
 * fall back to `az account show`. Returns null when neither CLI is found.
 */
export function checkPlatformCli(): Promise<CliCheckResult | null> {
  return new Promise((resolve) => {
    execFile("gh", ["auth", "status"], (err, _stdout, stderr) => {
      if (!err) {
        resolve({ cli: "gh", authenticated: true });
        return;
      }
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        // gh not found, try az
        execFile("az", ["account", "show"], (azErr) => {
          if (!azErr) {
            resolve({ cli: "az", authenticated: true });
            return;
          }
          const azCode = (azErr as NodeJS.ErrnoException).code;
          if (azCode === "ENOENT") {
            resolve(null);
            return;
          }
          resolve({ cli: "az", authenticated: false, error: stderr || azErr.message });
        });
        return;
      }
      // gh found but not authenticated
      resolve({ cli: "gh", authenticated: false, error: stderr || err.message });
    });
  });
}

// ── Unified CLI resolver ───────────────────────────────────────────────

/**
 * Resolve which platform CLI to use, combining a preferred choice (from
 * cached platform detection) with the runtime availability/auth check.
 *
 * Eliminates the auth-check duplication between create-issue, edit-issue,
 * and add-label (see issue #190).
 *
 * @param preferredCli  The CLI preferred based on cached platform detection, or null.
 * @param i18nPrefix    The i18n key prefix for error messages (e.g. "issues" or "editIssue").
 * @returns             `{ cli: "gh" | "az" }` on success, or `{ error: I18nMessage }` on failure.
 */
export async function resolvePlatformCli(
  preferredCli: "gh" | "az" | null,
  i18nPrefix: "issues" | "editIssue" | "labels",
): Promise<{ cli: "gh" | "az" } | { error: I18nMessage }> {
  const cliCheck = await checkPlatformCli();

  if (!cliCheck && !preferredCli) {
    return { error: msg(`${i18nPrefix}.noPlatformCli`) };
  }

  let useCli: "gh" | "az";

  if (preferredCli) {
    // Use the preferred CLI if it's available and authenticated
    if (preferredCli === "gh" && cliCheck?.cli === "gh" && cliCheck.authenticated) {
      useCli = "gh";
    } else if (preferredCli === "az" && cliCheck?.cli === "az" && cliCheck.authenticated) {
      useCli = "az";
    } else if (cliCheck && cliCheck.authenticated) {
      // Preferred CLI not available/authenticated, fall back to whatever works
      useCli = cliCheck.cli;
    } else {
      // No authenticated CLI at all
      if (!cliCheck) {
        return { error: msg(`${i18nPrefix}.noPlatformCli`) };
      }
      if (cliCheck.cli === "gh") {
        return { error: msg(`${i18nPrefix}.ghNotAuth`) };
      }
      return { error: msg(`${i18nPrefix}.azNotAuth`) };
    }
  } else {
    // No cached platform — use existing heuristic
    if (!cliCheck) {
      return { error: msg(`${i18nPrefix}.noPlatformCli`) };
    }
    if (!cliCheck.authenticated) {
      if (cliCheck.cli === "gh") {
        return { error: msg(`${i18nPrefix}.ghNotAuth`) };
      }
      return { error: msg(`${i18nPrefix}.azNotAuth`) };
    }
    useCli = cliCheck.cli;
  }

  return { cli: useCli };
}
