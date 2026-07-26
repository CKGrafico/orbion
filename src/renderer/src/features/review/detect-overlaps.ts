import type { PrOverlap, OverlapKind, BatchOverlapResult, ReviewOrderEntry, PrRiskLevel } from "../../../../shared/ipc";

export interface PrFileSet {
  key: string;
  number: number;
  filePaths: Set<string>;
  filesWithAdditions: Set<string>;
  riskLevel: PrRiskLevel;
}

const DUPLICATE_JACCARD_THRESHOLD = 0.6;

const RISK_ORDER: Record<PrRiskLevel, number> = {
  high: 4,
  medium: 3,
  uncertain: 2,
  low: 1,
};

export function detectBatchOverlaps(prs: PrFileSet[]): BatchOverlapResult {
  const overlaps: PrOverlap[] = [];
  const perPrNotes = new Map<string, string[]>();

  for (const pr of prs) {
    perPrNotes.set(pr.key, []);
  }

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

      const aNote = formatPrNote(kind, b.number, sharedFiles);
      const bNote = formatPrNote(kind, a.number, sharedFiles);
      perPrNotes.get(a.key)!.push(aNote);
      perPrNotes.get(b.key)!.push(bNote);
    }
  }

  const suggestedOrder = buildSuggestedOrder(prs, overlaps);

  return { overlaps, suggestedOrder, perPrNotes };
}

function classifyOverlap(
  a: PrFileSet,
  b: PrFileSet,
  sharedFiles: string[],
): OverlapKind {
  const unionSize = new Set([...a.filePaths, ...b.filePaths]).size;
  const jaccard = sharedFiles.length / unionSize;

  if (jaccard > DUPLICATE_JACCARD_THRESHOLD) {
    return "duplicate";
  }

  const conflictingFiles = sharedFiles.filter(
    (f) => a.filesWithAdditions.has(f) && b.filesWithAdditions.has(f),
  );

  if (conflictingFiles.length > 0) {
    return "conflict";
  }

  return "touching";
}

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

function formatPrNote(
  kind: OverlapKind,
  otherNumber: number,
  _sharedFiles: string[],
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

  const overlapCount = new Map<string, number>();
  for (const pr of prs) {
    overlapCount.set(pr.key, 0);
  }
  for (const overlap of overlaps) {
    overlapCount.set(overlap.prA, (overlapCount.get(overlap.prA) ?? 0) + 1);
    overlapCount.set(overlap.prB, (overlapCount.get(overlap.prB) ?? 0) + 1);
  }

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

function intersection<T>(a: Set<T>, b: Set<T>): T[] {
  const result: T[] = [];
  for (const item of a) {
    if (b.has(item)) {
      result.push(item);
    }
  }
  return result;
}
