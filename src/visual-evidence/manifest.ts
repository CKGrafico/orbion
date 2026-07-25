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
  const partial: Record<string, unknown> = {
    version: MANIFEST_VERSION,
    changeId: result.changeId,
    required: result.required,
    status: result.status,
    assets: opts.assets ?? [],
  };

  if (opts.scenario) partial["scenario"] = opts.scenario;
  if (opts.assertions) partial["assertions"] = opts.assertions;
  if (opts.temporaryArtifacts) partial["temporaryArtifacts"] = opts.temporaryArtifacts;
  if (opts.failedStep) partial["failedStep"] = opts.failedStep;
  if (opts.error) partial["error"] = opts.error;
  if (opts.reason) partial["reason"] = opts.reason;

  partial["prMarkdown"] = "";

  const manifestBeforeMd = partial as unknown as EvidenceManifest;
  const prMarkdown = generatePrMarkdown(manifestBeforeMd, opts.repo, opts.sha);
  partial["prMarkdown"] = prMarkdown;

  return partial as unknown as EvidenceManifest;
}

export function buildManifest(
  result: Pick<EvidenceResult, "changeId" | "required" | "status">,
  opts: BuildOptions,
): EvidenceManifest {
  return build(result, opts);
}

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

export function serializeManifest(manifest: EvidenceManifest): string {
  return JSON.stringify(manifest, null, 2);
}
