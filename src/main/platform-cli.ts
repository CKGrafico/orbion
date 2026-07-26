import { execFile } from "node:child_process";
import type { I18nMessage } from "../shared/ipc.js";
import { msg } from "./i18n.js";

export interface CliCheckResult {
  cli: "gh" | "az";
  authenticated: boolean;
  error?: string;
}

/** Try `gh auth status` first; if `gh` isn't installed (ENOENT), fall back to `az account show`. Returns null when neither CLI is found. */
export function checkPlatformCli(): Promise<CliCheckResult | null> {
  return new Promise((resolve) => {
    execFile("gh", ["auth", "status"], (err, _stdout, stderr) => {
      if (!err) {
        resolve({ cli: "gh", authenticated: true });
        return;
      }
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
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
      resolve({ cli: "gh", authenticated: false, error: stderr || err.message });
    });
  });
}

/**
 * Resolve which platform CLI to use, combining a preferred choice (from
 * cached platform detection) with the runtime availability/auth check.
 *
 * Eliminates the auth-check duplication between create-issue, edit-issue,
 * and add-label (see issue #190).
 */
export async function resolvePlatformCli(
  preferredCli: "gh" | "az" | null,
  i18nPrefix: "issues" | "editIssue" | "labels" | "review",
): Promise<{ cli: "gh" | "az" } | { error: I18nMessage }> {
  const cliCheck = await checkPlatformCli();

  if (!cliCheck && !preferredCli) {
    return { error: msg(`${i18nPrefix}.noPlatformCli`) };
  }

  let useCli: "gh" | "az";

  if (preferredCli) {
    if (preferredCli === "gh" && cliCheck?.cli === "gh" && cliCheck.authenticated) {
      useCli = "gh";
    } else if (preferredCli === "az" && cliCheck?.cli === "az" && cliCheck.authenticated) {
      useCli = "az";
    } else if (cliCheck && cliCheck.authenticated) {
      // Preferred CLI not available/authenticated, fall back to whatever works
      useCli = cliCheck.cli;
    } else {
      if (!cliCheck) {
        return { error: msg(`${i18nPrefix}.noPlatformCli`) };
      }
      if (cliCheck.cli === "gh") {
        return { error: msg(`${i18nPrefix}.ghNotAuth`) };
      }
      return { error: msg(`${i18nPrefix}.azNotAuth`) };
    }
  } else {
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
