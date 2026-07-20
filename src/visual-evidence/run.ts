/**
 * The visual-evidence orchestrator.
 *
 * This is the single entrypoint an autonomous agent invokes. The CLI is a
 * thin wrapper over {@link runVisualEvidence}.
 *
 * High-level flow:
 *   1. Validate input.
 *   2. Resolve the OpenSpec change.
 *   3. Decide whether evidence is required — skip if not.
 *   4. Derive the scenario — blocked if context insufficient.
 *   5. Build + launch Electron deterministically.
 *   6. Run the registered scenario runner with assertions + tracing.
 *   7. Capture final screenshot.
 *   8. Optionally convert the temp webm into an optimized GIF.
 *   9. Enforce size limits; drop oversized GIFs.
 *  10. Promote only final assets + evidence.json to the OpenSpec change.
 *
 * On failure at any step after launch: preserve temp failure.png + webm +
 * trace.zip; do NOT promote anything to permanent evidence; return a
 * structured failed result.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type {
  EvidenceInput,
  EvidenceResult,
  PassedEvidenceResult,
  SkippedEvidenceResult,
  FailedEvidenceResult,
  BlockedEvidenceResult,
  EvidenceAsset,
  CaptureCandidate,
  RepoCoordinates,
} from "./types.js";
import type { VisualEvidenceConfig } from "./config.js";
import { resolveConfig, findRepoRoot } from "./config.js";
import { readChangeContext } from "./openspec-resolver.js";
import { decideEvidenceRequired } from "./evidence-required.js";
import { deriveScenario } from "./scenario-deriver.js";
import { getScenario, runScenario, type ScenarioContext } from "./scenario-registry.js";
import { prepareTempDir } from "./launch/deterministic-env.js";
import { launchElectronApp } from "./launch/electron-launcher.js";
import { captureScreenshot } from "./capture/screenshot.js";
import { generateGif } from "./capture/gif.js";
import { enableVideo, enableTracing, stopTracing } from "./capture/video.js";
import { chooseFinalAssets } from "./size-limits.js";
import { clearEvidenceDir, writeFinalAssets, permanentEvidenceDir } from "./store.js";
import { writeManifest } from "./manifest.js";
import { generatePrMarkdown } from "./pr-markdown.js";

const EvidenceInputSchema = z.object({
  changeId: z.string().min(1),
  issue: z
    .object({
      number: z.number().int().positive(),
      title: z.string(),
      description: z.string(),
      acceptanceCriteria: z.array(z.string()),
    })
    .optional(),
  changedFiles: z.array(z.string()).optional(),
  scenario: z
    .object({
      title: z.string(),
      steps: z.array(z.string()),
    })
    .optional(),
  preferredEvidenceType: z.enum(["auto", "screenshot", "gif", "video"]).optional(),
  expectedStartingState: z.string().optional(),
  prNumber: z.number().int().positive().optional(),
  branchName: z.string().optional(),
  commitSha: z.string().optional(),
}).strict();

export function validateInput(input: unknown): EvidenceInput {
  const parsed = EvidenceInputSchema.parse(input);
  return parsed as EvidenceInput;
}

export interface RunOptions {
  readonly config?: VisualEvidenceConfig;
  readonly repo?: RepoCoordinates;
  readonly sha?: string;
  readonly skipBuild?: boolean;
}

export async function runVisualEvidence(
  input: EvidenceInput,
  opts: RunOptions = {},
): Promise<EvidenceResult> {
  const repoRoot = findRepoRoot();
  const config = opts.config ?? resolveConfig();

  // 1. Resolve the OpenSpec change
  let ctx;
  try {
    ctx = readChangeContext(repoRoot, input.changeId);
  } catch (err) {
    return blockedResult(input.changeId, `Failed to resolve OpenSpec change: ${(err as Error).message}`);
  }

  // 2. Decision: evidence required?
  const decision = decideEvidenceRequired(ctx);
  if (!decision.required) {
    return skippedResult(input.changeId, decision.reason);
  }

  // 3. Derive scenario
  const derivation = deriveScenario(ctx, input);
  if (derivation.blocked || !derivation.scenario) {
    // We need a concrete runner registered for the change OR an explicit
    // scenario. Without one, we cannot execute Playwright blindly.
    if (!getScenario(input.changeId)) {
      return blockedResult(
        input.changeId,
        derivation.reason ??
          `No concrete scenario runner is registered for change "${input.changeId}" and the context was insufficient to derive one.`,
      );
    }
  }

  const scenarioDef = getScenario(input.changeId);
  if (!scenarioDef) {
    return blockedResult(
      input.changeId,
      `The scenario for change "${input.changeId}" could only be derived as text, but no concrete Playwright runner is registered. Register a scenario in src/visual-evidence/scenario-registry.ts to enable automation.`,
    );
  }

  // 4. Prepare temp dir + launch Electron
  const temp = prepareTempDir(repoRoot, input.changeId, config);
  let launched: Awaited<ReturnType<typeof launchElectronApp>> | null = null;
  let videoController: ReturnType<typeof enableVideo> | null = null;

  try {
    try {
      launched = await launchElectronApp(repoRoot, temp, config, { skipBuild: opts.skipBuild });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to launch app: ${message}. Try ORBION_VISUAL_EVIDENCE_MODE=web (default) for headless Linux without GUI libraries.`,
      );
    }
    videoController = enableVideo(launched.context, temp, config);
    await enableTracing(launched.context, temp);

    const scenarioCtx: ScenarioContext = {
      repoRoot,
      app: launched.app ?? null,
      window: launched.window,
      temp,
      config,
    };

    // 5. Run the scenario
    const scenarioResult = await runScenario(scenarioDef, scenarioCtx);

    // Check assertions: if any failed, the run fails. We still capture a
    // screenshot for debugging, but do NOT promote to permanent evidence.
    const failedAssertions = scenarioResult.assertions.filter((a) => a.status === "failed");
    if (failedAssertions.length > 0) {
      // Capture a failure screenshot for debugging (temp only)
      try {
        const { captureFailureScreenshot } = await import("./capture/screenshot.js");
        await captureFailureScreenshot(launched.window, temp.failureScreenshot);
      } catch {
        // best-effort
      }
      const failedDescriptions = failedAssertions
        .map((a) => `  - ${a.description}${a.error ? ` (${a.error})` : ""}`)
        .join("\n");
      return failedResult(
        input.changeId,
        `${failedAssertions.length} assertion(s) failed:\n${failedDescriptions}`,
        "assertions",
        {
          screenshot: temp.failureScreenshot,
          video: temp.video,
          trace: temp.trace,
        },
      );
    }

    // 6. Capture final screenshot
    const screenshot = await captureScreenshot(launched.window, config, {
      caption: scenarioResult.scenario.title,
    });

    // 7. Stop video + try GIF conversion if recording succeeded
    const webmPath = videoController ? await videoController.stop() : null;
    let gifResult: Awaited<ReturnType<typeof generateGif>> = null;
    if (webmPath && fs.existsSync(webmPath) && config.gif.enabled) {
      gifResult = await generateGif(webmPath, temp.gifOut, config.gif);
    }

    // 8. Size limits + final-asset selection
    const candidates: CaptureCandidate[] = [
      {
        type: "screenshot",
        buffer: screenshot.buffer,
        width: screenshot.width,
        height: screenshot.height,
        bytes: screenshot.bytes,
        format: screenshot.format,
        caption: scenarioResult.scenario.title,
      },
    ];
    if (gifResult) {
      candidates.push({
        type: "gif",
        buffer: fs.readFileSync(gifResult.path),
        width: gifResult.width,
        height: gifResult.height,
        bytes: gifResult.bytes,
        format: "gif",
        fps: gifResult.fps,
        durationSeconds: gifResult.durationSeconds,
        caption: scenarioResult.scenario.title,
      });
    }

    const evidenceDir = permanentEvidenceDir(repoRoot, input.changeId, config);
    const relEvidenceDir = path.relative(repoRoot, evidenceDir);
    const screenshotRel = `${relEvidenceDir}/final.${screenshot.format}`;
    const gifRel = `${relEvidenceDir}/flow.gif`;

    const selection = chooseFinalAssets(candidates, config, screenshotRel, gifRel);
    const assets: EvidenceAsset[] = [];
    if (selection.screenshot) assets.push(selection.screenshot);
    if (selection.gif) assets.push(selection.gif);

    // 9. Promote final assets + write manifest
    clearEvidenceDir(repoRoot, input.changeId, config);
    const assetsToWrite: { filename: string; buffer: Buffer }[] = [];
    if (selection.screenshot) {
      assetsToWrite.push({
        filename: screenshot.format === "png" ? "final.png" : "final.webp",
        buffer: screenshot.buffer,
      });
    }
    if (selection.gif && gifResult) {
      assetsToWrite.push({ filename: "flow.gif", buffer: fs.readFileSync(gifResult.path) });
    }
    if (assetsToWrite.length > 0) {
      writeFinalAssets(repoRoot, input.changeId, config, assetsToWrite);
    }

    const sha = opts.sha ?? (await resolveHeadSha(repoRoot));
    const repo = opts.repo ?? (await resolveRepo(repoRoot));

    writeManifest(repoRoot, input.changeId, config, {
      changeId: input.changeId,
      required: true,
      status: "passed",
    }, {
      repo,
      sha,
      scenario: scenarioResult.scenario,
      assertions: scenarioResult.assertions,
      assets,
    });

    // Populate prMarkdown on the returned result so the CLI can emit it
    // without regenerating from a manifest. Using the same builder keeps
    // URLs consistent.
    const prMarkdown = generatePrMarkdown(
      {
        version: 1,
        changeId: input.changeId,
        required: true,
        status: "passed" as const,
        scenario: scenarioResult.scenario,
        assertions: scenarioResult.assertions,
        assets,
        prMarkdown: "",
      } as import("./types.js").PassedEvidenceResult,
      repo,
      sha,
    );

    return {
      version: 1,
      changeId: input.changeId,
      required: true,
      status: "passed",
      scenario: scenarioResult.scenario,
      assertions: scenarioResult.assertions,
      assets,
      prMarkdown,
    } as PassedEvidenceResult;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Best-effort failure capture for debugging
    if (launched) {
      try {
        const { captureFailureScreenshot } = await import("./capture/screenshot.js");
        await captureFailureScreenshot(launched.window, temp.failureScreenshot);
      } catch {
        // ignore — primary failure is reported via the structured result
      }
    }
    return failedResult(
      input.changeId,
      message,
      "run",
      {
        screenshot: temp.failureScreenshot,
        video: temp.video,
        trace: temp.trace,
      },
    );
  } finally {
    // Best-effort stop tracing + close app
    if (launched) {
      try {
        await stopTracing(launched.context, temp);
      } catch {
        // ignore
      }
      try {
        await launched.close();
      } catch {
        // ignore
      }
    }
  }
}

function blockedResult(changeId: string, reason: string): BlockedEvidenceResult {
  return {
    version: 1,
    changeId,
    required: false,
    status: "blocked",
    reason,
    assets: [],
    prMarkdown: "",
  };
}

function skippedResult(changeId: string, reason: string): SkippedEvidenceResult {
  return {
    version: 1,
    changeId,
    required: false,
    status: "skipped",
    reason,
    assets: [],
    prMarkdown: "",
  };
}

function failedResult(
  changeId: string,
  error: string,
  step: string,
  temporaryArtifacts: { screenshot?: string; video?: string; trace?: string },
): FailedEvidenceResult {
  return {
    version: 1,
    changeId,
    required: true,
    status: "failed",
    failedStep: step,
    error,
    temporaryArtifacts,
    assets: [],
    prMarkdown: "",
  };
}

async function resolveHeadSha(repoRoot: string): Promise<string> {
  try {
    const { execSync } = await import("node:child_process");
    return execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "main";
  }
}

async function resolveRepo(repoRoot: string): Promise<RepoCoordinates> {
  void repoRoot;
  // Default to the canonical repo from AGENTS.md / GitHub. The CLI tries `gh`
  // first; we keep a sensible default here.
  return { owner: "CKGrafico", name: "orbion" };
}
