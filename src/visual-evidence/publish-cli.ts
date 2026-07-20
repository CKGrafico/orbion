#!/usr/bin/env node
import { parseArgs } from "node:util";
import { findRepoRoot } from "./config.js";
import {
  createVerifiedPublication,
  publishVerifiedEvidence,
} from "./github-evidence-publisher.js";

const repo = { owner: "CKGrafico", name: "orbion" } as const;

function main(): number {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      change: { type: "string" },
      pr: { type: "string" },
    },
    strict: true,
  });
  if (!values.change) {
    console.error("Usage: pnpm visual-evidence:publish --change <change-id> [--pr <number>]");
    return 3;
  }
  const prNumber = values.pr === undefined ? undefined : Number(values.pr);
  if (prNumber !== undefined && (!Number.isInteger(prNumber) || prNumber < 1)) {
    console.error("The PR number must be a positive integer.");
    return 3;
  }

  const repoRoot = findRepoRoot();
  try {
    const publication = createVerifiedPublication(repoRoot, values.change, repo);
    const result = publishVerifiedEvidence(repoRoot, repo, publication, prNumber);
    console.log(`Evidence published to issue comment ${result.issueCommentId}.`);
    if (result.prCommentId) console.log(`Evidence published to PR comment ${result.prCommentId}.`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

process.exit(main());
