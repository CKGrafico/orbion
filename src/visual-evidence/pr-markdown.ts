/**
 * Generate the ready-to-use Markdown fragment for the pull request.
 *
 * The external Loop Engineering workflow consumes this `prMarkdown` string
 * when creating or updating the PR body.
 *
 * URLs are anchored to the head commit SHA when available (rather than the
 * branch name) so the embedded images keep resolving after the branch is
 * deleted or rebased. Uses `raw.githubusercontent.com` so the images render
 * inline on GitHub.
 */
import type {
  EvidenceResult,
  PassedEvidenceResult,
  FailedEvidenceResult,
  SkippedEvidenceResult,
  BlockedEvidenceResult,
  EvidenceAsset,
} from "./types.js";
import type { RepoCoordinates } from "./types.js";

export function rawImageUrl(
  repo: RepoCoordinates,
  sha: string,
  assetPath: string,
): string {
  return `https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${sha}/${assetPath}`;
}

function mdImage(alt: string, url: string): string {
  return `![${alt}](${url})`;
}

function scenarioDetailsBlock(scenario: { title: string; steps: readonly string[] }): string {
  if (!scenario.steps.length) return "";
  const lines = scenario.steps.map((s, i) => `${i + 1}. ${s}`);
  return [
    "<details>",
    "<summary>Automated validation scenario</summary>",
    "",
    ...lines,
    "",
    "</details>",
  ].join("\n");
}

function renderPassed(
  r: PassedEvidenceResult,
  repo: RepoCoordinates,
  sha: string,
): string {
  const lines: string[] = [];
  lines.push("## Visual Evidence");
  lines.push(`### ${r.scenario.title}`);
  lines.push("");
  for (const asset of r.assets) {
    const url = rawImageUrl(repo, sha, asset.path);
    lines.push(mdImage(assetCaption(asset), url));
  }
  lines.push("");
  lines.push(scenarioDetailsBlock(r.scenario));
  return lines.join("\n");
}

function assetCaption(asset: EvidenceAsset): string {
  return asset.caption ?? asset.type;
}

function renderSkipped(r: SkippedEvidenceResult): string {
  if (!r.reason) return "";
  return [
    "## Visual Evidence",
    "",
    "_No visual evidence required for this change._",
    "",
    `<details><summary>Reason</summary>`,
    "",
    r.reason,
    "",
    "</details>",
  ].join("\n");
}

function renderFailed(r: FailedEvidenceResult): string {
  const lines: string[] = [];
  lines.push("## Visual Evidence");
  lines.push("");
  lines.push("⚠️ **Automated visual evidence failed.**");
  lines.push("");
  if (r.scenario) {
    lines.push(`Scenario: ${r.scenario.title}`);
    lines.push("");
  }
  lines.push(`Failed step: ${r.failedStep}`);
  lines.push("");
  lines.push("Error:");
  lines.push("```");
  lines.push(r.error);
  lines.push("```");
  if (r.temporaryArtifacts?.screenshot || r.temporaryArtifacts?.video || r.temporaryArtifacts?.trace) {
    lines.push("");
    lines.push("Temporary artifacts (not committed):");
    const ta = r.temporaryArtifacts;
    if (ta.screenshot) lines.push(`- ${ta.screenshot}`);
    if (ta.video) lines.push(`- ${ta.video}`);
    if (ta.trace) lines.push(`- ${ta.trace}`);
  }
  return lines.join("\n");
}

function renderBlocked(r: BlockedEvidenceResult): string {
  if (!r.reason) return "";
  return [
    "## Visual Evidence",
    "",
    "⚠️ **Automated visual evidence was blocked.**",
    "",
    r.reason,
  ].join("\n");
}

export function generatePrMarkdown(
  result: EvidenceResult,
  repo: RepoCoordinates,
  sha: string,
): string {
  switch (result.status) {
    case "passed":
      return renderPassed(result, repo, sha);
    case "skipped":
      return renderSkipped(result);
    case "failed":
      return renderFailed(result);
    case "blocked":
      return renderBlocked(result);
  }
}

/**
 * Build the prMarkdown string at evidence.json write time. The Markdown is
 * anchored to sha, falling back to branch when no sha is known.
 */
export function resolveRef(branchName?: string, commitSha?: string): string {
  return commitSha ?? branchName ?? "main";
}
