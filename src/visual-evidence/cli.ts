#!/usr/bin/env node
/**
 * Visual-evidence CLI.
 *
 * Modes: ORBION_VISUAL_EVIDENCE_MODE=web (default, headless Chromium)
 * or =electron (real app, needs GUI libs + xvfb on headless Linux).
 *
 * Exit codes: 0=passed/skipped, 1=failed, 2=blocked, 3=invalid input.
 */
import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { validateInput, runVisualEvidence } from "./run.js";
import { resolveConfig, findRepoRoot } from "./config.js";
import { writeManifest } from "./manifest.js";
import { generatePrMarkdown } from "./pr-markdown.js";
import { clearEvidenceDir } from "./store.js";
import { evidenceExitCode } from "./exit-code.js";
import type { RepoCoordinates } from "./types.js";

/** Attributed to the current change for the unhandled-rejection handler. */
let pendingChangeId: string | null = null;

interface ParsedArgs {
  change?: string;
  input?: string;
  allowArchived?: boolean;
}

function parseCliArgs(argv: readonly string[]): ParsedArgs {
  const { values } = parseArgs({
    args: argv as string[],
    options: {
      change: { type: "string" },
      input: { type: "string" },
      "allow-archived": { type: "boolean" },
    },
    strict: true,
    allowPositionals: false,
  });
  return { change: values.change, input: values.input, allowArchived: values["allow-archived"] };
}

function readInputFile(p: string): unknown {
  if (!fs.existsSync(p)) {
    throw new Error(`Input file not found: ${p}`);
  }
  const raw = fs.readFileSync(p, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Input file is not valid JSON: ${p}\n${(err as Error).message}`);
  }
}

function resolveHeadSha(repoRoot: string): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    return "main";
  }
}

function resolveCurrentBranch(repoRoot: string): string | undefined {
  try {
    return execFileSync("git", ["branch", "--show-current"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    return undefined;
  }
}

function resolveRepo(): RepoCoordinates {
  // Degrades gracefully to hardcoded default when gh is unavailable
  try {
    const out = execFileSync(
      "gh",
      ["repo", "view", "PlainConceptsPlatform/orbion", "--json", "owner,name"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    const parsed = JSON.parse(out) as { owner: { login: string }; name: string };
    return { owner: parsed.owner.login, name: parsed.name };
  } catch {
    return { owner: "PlainConceptsPlatform", name: "orbion" };
  }
}

async function main(): Promise<number> {
  let parsed: ParsedArgs;
  try {
    parsed = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Invalid CLI arguments: ${(err as Error).message}`);
    console.error("Usage: pnpm visual-evidence --change <change-id> | --input <path>");
    return 3;
  }

  if (!parsed.change && !parsed.input) {
    console.error("Either --change <id> or --input <path> is required.");
    console.error("Usage: pnpm visual-evidence --change <change-id> | --input <path>");
    return 3;
  }

  let inputObj: unknown;
  if (parsed.input) {
    try {
      inputObj = readInputFile(parsed.input);
    } catch (err) {
      console.error((err as Error).message);
      return 3;
    }
    if (parsed.change) {
      // --change overrides changeId in the input file
      const obj = inputObj as Record<string, unknown>;
      obj["changeId"] = parsed.change;
      inputObj = obj;
    }
  } else {
    inputObj = { changeId: parsed.change };
  }

  let input;
  try {
    input = validateInput(inputObj);
  } catch (err) {
    console.error("Input validation failed:");
    console.error((err as Error).message);
    return 3;
  }
  pendingChangeId = input.changeId;

  const repoRoot = findRepoRoot();
  const config = resolveConfig();
  const sha = process.env.ORBION_VISUAL_EVIDENCE_SHA ?? resolveHeadSha(repoRoot);
  const branch = process.env.ORBION_VISUAL_EVIDENCE_BRANCH ?? resolveCurrentBranch(repoRoot);
  const repo = resolveRepo();

  let result;
  try {
    result = await runVisualEvidence(input, {
      config,
      repo,
      sha,
      skipBuild: process.env.ORBION_VISUAL_EVIDENCE_SKIP_BUILD === "1",
      allowArchived: parsed.allowArchived,
    });
  } catch (err) {
    console.error(`Visual-evidence run failed unexpectedly: ${(err as Error).message}`);
    return 1;
  }

  if (result.status === "skipped") {
    try {
      writeManifest(repoRoot, input.changeId, config, {
        changeId: result.changeId,
        required: result.required,
        status: result.status,
      }, { repo, sha, reason: result.reason });
    } catch {
    // best-effort
  }
  console.log(`Visual evidence: ${result.status.toUpperCase()} — ${result.reason}`);
    return 0;
  }

  if (result.status === "blocked") {
    clearEvidenceDir(repoRoot, input.changeId, config);
    console.error(`Visual evidence BLOCKED: ${result.reason}`);
    return evidenceExitCode(result);
  }

  if (result.status === "failed") {
    clearEvidenceDir(repoRoot, input.changeId, config);
    console.error(`Visual evidence FAILED — step "${result.failedStep}": ${result.error}`);
    return evidenceExitCode(result);
  }

  // passed
  const prMarkdown = generatePrMarkdown(result, repo, sha);
  console.log(prMarkdown);
  console.error(`\nVisual evidence PASSED for ${result.changeId}.`);
  console.error(`Branch: ${branch ?? "<unknown>"}  SHA: ${sha}`);
  console.error(`Assets:`);
  for (const asset of result.assets) {
    console.error(`  - ${path.join(repoRoot, asset.path)} (${asset.bytes} bytes, ${asset.format})`);
  }

  return 0;
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((err) => {
    console.error(`Unhandled error: ${(err as Error).message}`);
    process.exit(1);
  });

// Playwright emits "Process failed to launch!" on an un-awaited Promise from
// electron.launch(). Without this handler the structured `failed` result in
// run.ts is skipped because the unhandled rejection kills the process first.
process.on("unhandledRejection", async (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error(`Visual evidence: unhandled rejection from Playwright/internal: ${msg}`);
  console.error("The Electron process failed to launch. On headless Linux, install the required system GUI libraries (see SKILL.md) and run under xvfb-run.");
  // Best-effort: write a failed manifest so the audit trail is preserved
  try {
    const cfg = resolveConfig();
    const root = findRepoRoot();
    writeManifest(root, pendingChangeId ?? "unknown", cfg, {
      changeId: pendingChangeId ?? "unknown",
      required: true,
      status: "failed",
    }, {
      repo: { owner: "PlainConceptsPlatform", name: "orbion" },
      sha: process.env.ORBION_VISUAL_EVIDENCE_SHA ?? resolveHeadSha(root),
      failedStep: "launch",
      error: msg,
      temporaryArtifacts: {
        screenshot: `.tmp/visual-evidence/${pendingChangeId ?? "unknown"}/failure.png`,
        video: `.tmp/visual-evidence/${pendingChangeId ?? "unknown"}/video.webm`,
        trace: `.tmp/visual-evidence/${pendingChangeId ?? "unknown"}/trace.zip`,
      },
    });
  } catch {
    // best-effort
  }
  process.exit(1);
});
