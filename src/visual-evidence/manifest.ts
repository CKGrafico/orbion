/**
 * Build and write the evidence.json manifest into the OpenSpec change's
 * `evidence/` folder.
 *
 * The manifest is the single source of truth for what evidence exists, whether
 * the scenario passed/failed/skipped, the assertions that were run, the final
 * asset sizes, and the PR markdown fragment the external Loop Engineering
 * workflow should paste into the pull request.
 *
 * On failure, NO manifest is written into the permanent evidence folder.
 */
import fs from "node:fs";
import path from "node:path";
import type { VisualEvidenceConfig } from "./config.js";
import type {
  EvidenceResult,
  EvidenceManifest,
  EvidenceAsset,
  TemporaryArtifacts,
  AssertionResult,
  Scenario,
} from "./types.js";
import { permanentEvidenceDir } from "./store.js";
import { generatePrMarkdown } from "./pr-markdown.js";
import type { RepoCoordinates } from "./types.js";

export const MANIFEST_VERSION = 1;

interface BuildOptions {
  readonly repo: RepoCoordinates;
  readonly sha: string;
  readonly scenario?: Scenario;
  readonly assertions?: readonly AssertionResult[];
  readonly assets?: readonly EvidenceAsset[];
  readonly temporaryArtifacts?: TemporaryArtifacts;
  readonly failedStep?: string;
  readonly error?: string;
  readonly reason?: string;
}

function build(
  result: Pick<EvidenceResult, "changeId" | "required" | "status">,
  opts: BuildOptions,
): EvidenceManifest {
  const prMarkdown = (() => {
    switch (result.status) {
      case "passed":
      case "skipped":
      case "failed":
      case "blocked": {
        const manifest = {
          version: MANIFEST_VERSION as const,
          changeId: result.changeId,
          required: result.required,
          status: result.status,
          assets: opts.assets ?? [],
          prMarkdown: "",
          ...buildVerboseFields(result.status, opts),
        };
        return generatePrMarkdown(manifest, opts.repo, opts.sha);
      }
    }
  })();

  const manifest: Record<string, unknown> = {
    version: MANIFEST_VERSION,
    changeId: result.changeId,
    required: result.required,
    status: result.status,
    assets: opts.assets ?? [],
    prMarkdown,
  };

  if (opts.scenario) manifest["scenario"] = opts.scenario;
  if (opts.assertions) manifest["assertions"] = opts.assertions;
  if (opts.temporaryArtifacts) manifest["temporaryArtifacts"] = opts.temporaryArtifacts;
  if (opts.failedStep) manifest["failedStep"] = opts.failedStep;
  if (opts.error) manifest["error"] = opts.error;
  if (opts.reason) manifest["reason"] = opts.reason;

  return manifest as unknown as EvidenceManifest;
}

function buildVerboseFields(
  status: string,
  opts: BuildOptions,
): Partial<EvidenceManifest> {
  if (status === "skipped") {
    return { reason: opts.reason ?? "" };
  }
  if (status === "failed") {
    return {
      failedStep: opts.failedStep ?? "",
      error: opts.error ?? "",
      temporaryArtifacts: opts.temporaryArtifacts ?? {},
    };
  }
  if (status === "blocked") {
    return { reason: opts.reason ?? "" };
  }
  return {};
}

export function buildManifest(
  result: Pick<EvidenceResult, "changeId" | "required" | "status">,
  opts: BuildOptions,
): EvidenceManifest {
  return build(result, opts);
}

/**
 * Build the prMarkdown and write the evidence.json manifest into the
 * permanent evidence folder.
 *
 * Returns the path to the written manifest.
 */
export function writeManifest(
  repoRoot: string,
  changeId: string,
  config: VisualEvidenceConfig,
  result: Pick<EvidenceResult, "changeId" | "required" | "status">,
  opts: BuildOptions,
): string {
  const manifest = buildManifest(result, opts);
  const dir = permanentEvidenceDir(repoRoot, changeId, config);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "evidence.json");
  fs.writeFileSync(target, JSON.stringify(manifest, null, 2));
  return target;
}

/** Serialize a manifest to JSON string (for CLI stdout / tests). */
export function serializeManifest(manifest: EvidenceManifest): string {
  return JSON.stringify(manifest, null, 2);
}
