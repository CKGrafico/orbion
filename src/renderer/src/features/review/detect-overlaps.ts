/**
 * Cross-PR overlap detection algorithm.
 *
 * Analyzes changed-file sets across a batch of PRs and returns:
 * - Pairwise overlaps (conflict / duplicate / touching)
 * - Per-PR notes for queue strip rendering
 * - Suggested review order (overlapping PRs first, highest risk first)
 *
 * The algorithm is a pure function with no network or side-effect dependencies.
 * It consumes file-list data already fetched by the review mode service.
 */

import type { PrOverlap, OverlapKind, BatchOverlapResult, ReviewOrderEntry, PrRiskLevel } from "../../../../shared/ipc";

/** Input for overlap analysis: a single PR's file list and metadata. */
export interface PrFileSet {
  /** PR key in "repo:number" format. */
  key: string;
  /** PR number. */
  number: number;
  /** Set of changed file paths. */
  filePaths: Set<string>;
  /** Whether this PR has additions in each file (for conflict detection). */
  filesWithAdditions: Set<string>;
  /** Risk level from diff analysis (for review order sorting). */
  riskLevel: PrRiskLevel;
}

/** Jaccard similarity threshold for "near-duplicate" classification. */
const DUPLICATE_JACCARD_THRESHOLD = 0.6;

/** Risk level sort order (higher = review sooner). */
const RISK_ORDER: Record<PrRiskLevel, number> = {
  high: 4,
  medium: 3,
  uncertain: 2,
  low: 1,
};

/**
 * Detect overlaps across a batch of PRs and produce a suggested review order.
 *
 * @param prs - The PRs in the batch with their file sets and risk levels.
 * @returns The complete overlap analysis result.
 */
export function detectBatchOverlaps(prs: PrFileSet[]): BatchOverlapResult {
  const overlaps: PrOverlap[] = [];
  const perPrNotes = new Map<string, string[]>();

  // Initialize per-PR notes
  for (const pr of prs) {
    perPrNotes.set(pr.key, []);
  }

  // Step 1: Pairwise comparison
  for (let i = 0; i < prs.length; i++) {
    for (let j = i + 1; j < prs.length; j++) {
      const a = prs[i];
      const b = prs[j];

      const sharedFiles = intersection(a.filePaths, b.filePaths);
      if (sharedFiles.length === 0) continue;

      const kind = classifyOverlap(a, b, sharedFiles);
      const note = buildNote(kind, sharedFiles, a.number, b.number);

      const overlap: PrOverlap = {
        prA: a.key,
        prB: b.key,
        kind,
        sharedFiles,
        note,
      };
      overlaps.push(overlap);

      // Add reciprocal notes
      const aNote = formatPrNote(kind, b.number, sharedFiles);
      const bNote = formatPrNote(kind, a.number, sharedFiles);
      perPrNotes.get(a.key)!.push(aNote);
      perPrNotes.get(b.key)!.push(bNote);
    }
  }

  // Step 2: Suggested review order
  const suggestedOrder = buildSuggestedOrder(prs, overlaps);

  return { overlaps, suggestedOrder, perPrNotes };
}

/**
 * Classify the overlap between two PRs.
 */
function classifyOverlap(
  a: PrFileSet,
  b: PrFileSet,
  sharedFiles: string[],
): OverlapKind {
  // Check for near-duplicate first (higher severity)
  const unionSize = new Set([...a.filePaths, ...b.filePaths]).size;
  const jaccard = sharedFiles.length / unionSize;

  if (jaccard > DUPLICATE_JACCARD_THRESHOLD) {
    return "duplicate";
  }

  // Check for conflict: both PRs have additions in the same file
  const conflictingFiles = sharedFiles.filter(
    (f) => a.filesWithAdditions.has(f) && b.filesWithAdditions.has(f),
  );

  if (conflictingFiles.length > 0) {
    return "conflict";
  }

  // General overlap
  return "touching";
}

/**
 * Build a human-readable overlap note.
 */
function buildNote(
  kind: OverlapKind,
  sharedFiles: string[],
  numA: number,
  numB: number,
): string {
  const fileNames = sharedFiles
    .slice(0, 2)
    .map((f) => f.split("/").pop() ?? f);
  const suffix = sharedFiles.length > 2 ? ` +${sharedFiles.length - 2} more` : "";
  const fileList = fileNames.join(", ") + suffix;

  switch (kind) {
    case "conflict":
      return `Both modify ${fileList} — potential merge conflict`;
    case "duplicate":
      return `Near-identical changes as #${numB} / #${numA}`;
    case "touching":
      return `Shares ${fileList} with #${numB} / #${numA}`;
  }
}

/**
 * Format a per-PR note for the queue strip (referencing the *other* PR).
 */
function formatPrNote(
  kind: OverlapKind,
  otherNumber: number,
  sharedFiles: string[],
): string {
  switch (kind) {
    case "conflict":
      return `conflicts with #${otherNumber}`;
    case "duplicate":
      return `near-duplicate of #${otherNumber}`;
    case "touching":
      return `overlaps #${otherNumber} — review together`;
  }
}

/**
 * Build a suggested review order that prioritizes overlapping PRs.
 */
function buildSuggestedOrder(
  prs: PrFileSet[],
  overlaps: PrOverlap[],
): ReviewOrderEntry[] {
  if (overlaps.length === 0) {
    return prs.map((pr) => ({
      prKey: pr.key,
      number: pr.number,
      reason: "Independent — review anytime",
    }));
  }

  // Count overlaps per PR
  const overlapCount = new Map<string, number>();
  for (const pr of prs) {
    overlapCount.set(pr.key, 0);
  }
  for (const overlap of overlaps) {
    overlapCount.set(overlap.prA, (overlapCount.get(overlap.prA) ?? 0) + 1);
    overlapCount.set(overlap.prB, (overlapCount.get(overlap.prB) ?? 0) + 1);
  }

  // Build overlap adjacency for "review together" notes
  const overlapPartners = new Map<string, number[]>();
  for (const pr of prs) {
    overlapPartners.set(pr.key, []);
  }
  for (const overlap of overlaps) {
    const aNum = parseInt(overlap.prA.split(":").pop() ?? "0", 10);
    const bNum = parseInt(overlap.prB.split(":").pop() ?? "0", 10);
    overlapPartners.get(overlap.prA)!.push(bNum);
    overlapPartners.get(overlap.prB)!.push(aNum);
  }

  // Sort: most overlaps first, then highest risk
  const sorted = [...prs].sort((a, b) => {
    const aCount = overlapCount.get(a.key) ?? 0;
    const bCount = overlapCount.get(b.key) ?? 0;
    if (bCount !== aCount) return bCount - aCount;
    return (RISK_ORDER[b.riskLevel] ?? 0) - (RISK_ORDER[a.riskLevel] ?? 0);
  });

  return sorted.map((pr) => {
    const count = overlapCount.get(pr.key) ?? 0;
    const partners = overlapPartners.get(pr.key) ?? [];

    let reason: string;
    if (count === 0) {
      reason = "Independent — review anytime";
    } else if (partners.length <= 2) {
      reason = `Overlaps with #${partners.join(", #")} — review together`;
    } else {
      const shown = partners.slice(0, 2).map((n) => `#${n}`).join(", ");
      reason = `Overlaps with ${shown} +${partners.length - 2} more — review together`;
    }

    return {
      prKey: pr.key,
      number: pr.number,
      reason,
    };
  });
}

/**
 * Compute the intersection of two sets as an array.
 */
function intersection<T>(a: Set<T>, b: Set<T>): T[] {
  const result: T[] = [];
  for (const item of a) {
    if (b.has(item)) {
      result.push(item);
    }
  }
  return result;
}
