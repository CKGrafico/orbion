#!/usr/bin/env node
/**
 * Visual-evidence CLI entrypoint.
 *
 * Usage:
 *   pnpm visual-evidence --change <change-id>
 *   pnpm visual-evidence --input .orbion/context/<change-id>.json
 *
 * Reads the input, resolves the OpenSpec change, runs the visual-evidence
 * pipeline, prints the evidence PR markdown to stdout, writes evidence.json
 * into the change's evidence/ folder, then commits + pushes the evidence so
 * raw.githubusercontent.com URLs resolve immediately.
 *
 * On headless Linux (no $DISPLAY), the CLI auto re-execs itself under
 * `xvfb-run -a` so the Electron window can render.
 *
 * Exit codes:
 *   0 — passed or correctly skipped
 *   1 — failed (scenario assertions failed)
 *   2 — blocked (input/launch scenario unresolvable)
 *   3 — invalid input
 */
import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { validateInput, runVisualEvidence } from "./run.js";
import { resolveConfig, findRepoRoot } from "./config.js";
import { writeManifest } from "./manifest.js";
import { generatePrMarkdown } from "./pr-markdown.js";
import type { RepoCoordinates } from "./types.js";

const __filename = fileURLToPath(import.meta.url);

/**
 * On headless Linux (no DISPLAY), re-exec this process under xvfb-run -a so
 * Electron can render. Returns true if a re-exec was performed (caller should
 * NOT continue — the child process owns the rest of the run).
 */
function maybeRexecUnderXvfb(): boolean {
  if (process.platform !== "linux") return false;
  if (process.env.DISPLAY) return false;
  if (process.env.ORBION_VISUAL_EVIDENCE_UNDER_XVFB === "1") return false;

  // Check xvfb-run is on PATH
  let xvfbBin: string;
  try {
    xvfbBin = execFileSync("which", ["xvfb-run"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return false; // xvfb-run not installed — proceed without, will fail later with a clear message
  }
  if (!xvfbBin) return false;

  // Re-exec under xvfb-run. We must re-invoke via `tsx` (not plain node)
  // because the CLI is TypeScript. Find the tsx binary.
  const args = process.argv.slice(2);
  // Prefer the tsx that's running us: if TSX_CLI_PATH is set (we set it below),
  // use that; otherwise fall back to npx tsx.
  const tsxPath = process.env.TSX_CLI_PATH ?? (() => {
    try {
      return execFileSync("which", ["tsx"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      return null;
    }
  })();
  if (!tsxPath) return false;

  const result = spawnSync("xvfb-run", ["-a", tsxPath, __filename, ...args], {
    stdio: "inherit",
    env: {
      ...process.env,
      ORBION_VISUAL_EVIDENCE_UNDER_XVFB: "1",
      // Pass-through the tsx path so a nested re-exec (shouldn't happen)
      // can find it.
      TSX_CLI_PATH: tsxPath,
    },
  });
  process.exit(result.status ?? 1);
}

// ── Auto re-exec under xvfb-run on headless Linux ──────────────────────
maybeRexecUnderXvfb();

/** Tracks the changeId currently being processed so the unhandled-rejection
 * handler can attribute the failure to the right change. */
let pendingChangeId: string | null = null;

interface ParsedArgs {
  change?: string;
  input?: string;
}

function parseCliArgs(argv: readonly string[]): ParsedArgs {
  const { values } = parseArgs({
    args: argv as string[],
    options: {
      change: { type: "string" },
      input: { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });
  return { change: values.change, input: values.input };
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
  // The canonical repo is fixed per AGENTS.md; `gh repo view` would be the
  // preferred source but we degrade gracefully when gh is unavailable.
  try {
    const out = execFileSync(
      "gh",
      ["repo", "view", "CKGrafico/orbion", "--json", "owner,name"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    const parsed = JSON.parse(out) as { owner: { login: string }; name: string };
    return { owner: parsed.owner.login, name: parsed.name };
  } catch {
    return { owner: "CKGrafico", name: "orbion" };
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
      // --change is allowed alongside --input to override changeId
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
    result = await runVisualEvidence(input, { config, repo, sha, skipBuild: process.env.ORBION_VISUAL_EVIDENCE_SKIP_BUILD === "1" });
  } catch (err) {
    console.error(`Visual-evidence run failed unexpectedly: ${(err as Error).message}`);
    return 1;
  }

  // For skipped/blocked: write a manifest so the run is auditable.
  if (result.status === "skipped" || result.status === "blocked") {
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

  if (result.status === "failed") {
    try {
      writeManifest(repoRoot, input.changeId, config, {
        changeId: result.changeId,
        required: result.required,
        status: result.status,
      }, {
        repo,
        sha,
        scenario: result.scenario,
        assertions: result.assertions,
        temporaryArtifacts: result.temporaryArtifacts,
        failedStep: result.failedStep,
        error: result.error,
      });
    } catch {
      // best-effort
    }
    console.error(`Visual evidence FAILED — step "${result.failedStep}": ${result.error}`);
    return 1;
  }

  // passed — re-generate prMarkdown anchored to the head SHA and emit stdout
  const prMarkdown = generatePrMarkdown(result, repo, sha);
  console.log(prMarkdown);
  console.error(`\nVisual evidence PASSED for ${result.changeId}.`);
  console.error(`Branch: ${branch ?? "<unknown>"}  SHA: ${sha}`);
  console.error(`Assets:`);
  for (const asset of result.assets) {
    console.error(`  - ${path.join(repoRoot, asset.path)} (${asset.bytes} bytes, ${asset.format})`);
  }

  // Commit + push the evidence files so the raw.githubusercontent.com URLs
  // in the PR markdown resolve immediately on GitHub. The evidence folder
  // lives under openspec/changes/<id>/evidence/ which is tracked by git.
  try {
    const evidenceGlob = path.join("openspec", "changes", input.changeId, "evidence");
    execFileSync("git", ["add", evidenceGlob], { cwd: repoRoot, stdio: "ignore" });
    // Only commit if there are staged changes
    const diff = execFileSync("git", ["diff", "--cached", "--quiet"], { cwd: repoRoot }).toString();
    void diff; // empty string means no changes; non-zero exit means changes exist
  } catch {
    // diff --cached --quiet exits 1 when there are staged changes — that's expected
    try {
      execFileSync(
        "git",
        ["commit", "-m", `docs(visual-evidence): ${input.changeId} evidence (final.webp + evidence.json)`],
        { cwd: repoRoot, stdio: "ignore" },
      );
      execFileSync("git", ["push", "origin", branch ?? "main"], {
        cwd: repoRoot,
        stdio: "ignore",
      });
      console.error(`Evidence committed and pushed to origin/${branch ?? "main"}.`);
    } catch (commitErr) {
      console.error(`Warning: could not commit/push evidence: ${(commitErr as Error).message}`);
      console.error(`The evidence files are on disk but not pushed — raw URLs will not resolve until you commit and push manually.`);
    }
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

// Catch async rejections that escape Playwright's internal dispatcher back into
// the caller — particularly the "Process failed to launch!" error, which
// Playwright emits on a Promise that is not awaited by `electron.launch()`.
// Without this, the structured `failed` result we built in run.ts is skipped
// because the unhandled rejection kills the process first.
process.on("unhandledRejection", async (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error(`Visual evidence: unhandled rejection from Playwright/internal: ${msg}`);
  console.error("The Electron process failed to launch. On headless Linux, install the required system GUI libraries (see SKILL.md) and run under xvfb-run.");
  // Best-effort: write a failed manifest so the audit trail is preserved.
  try {
    const cfg = resolveConfig();
    const root = findRepoRoot();
    writeManifest(root, pendingChangeId ?? "unknown", cfg, {
      changeId: pendingChangeId ?? "unknown",
      required: true,
      status: "failed",
    }, {
      repo: { owner: "CKGrafico", name: "orbion" },
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
