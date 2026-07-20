# Spec: Overlap Detection Algorithm

## Overview
A pure function that takes a batch of PRs with their file lists and returns overlap information for UI rendering.

## Types

```typescript
/** Overlap severity between two PRs. */
export type OverlapKind = "conflict" | "duplicate" | "touching";

/** Overlap between two PRs in a batch. */
export interface PrOverlap {
  /** Key of the first PR ("repo:number"). */
  prA: string;
  /** Key of the second PR ("repo:number"). */
  prB: string;
  /** Overlap classification. */
  kind: OverlapKind;
  /** File paths shared between both PRs. */
  sharedFiles: string[];
  /** Human-readable note (e.g. "Same security fix as #42"). */
  note: string;
}

/** Suggested review order entry. */
export interface ReviewOrderEntry {
  /** PR key ("repo:number"). */
  prKey: string;
  /** PR number. */
  number: number;
  /** Why this position in the order. */
  reason: string;
}

/** Result of overlap analysis for an entire batch. */
export interface BatchOverlapResult {
  /** All detected overlaps between pairs of PRs. */
  overlaps: PrOverlap[];
  /** Suggested review order (empty if no overlaps). */
  suggestedOrder: ReviewOrderEntry[];
  /** Overlap notes per PR key (for quick lookup by the queue strip). */
  perPrNotes: Map<string, string[]>;
}
```

## Algorithm

### Step 1: Build per-PR file sets
For each PR in the batch, extract the set of changed file paths from the diff result.

### Step 2: Pairwise comparison
For each unique pair (A, B) in the batch:
1. Compute `sharedFiles = fileSetA ∩ fileSetB`
2. If `sharedFiles` is empty, skip.
3. Classify overlap:
   - **conflict**: Both PRs have additions in the same file path (potential edit conflict).
   - **duplicate**: Jaccard similarity `|A ∩ B| / |A ∪ B| > 0.6` — the PRs modify nearly the same set of files, suggesting redundant work.
   - **touching**: General overlap (shared files but different scopes).
4. Generate a human-readable `note`:
   - conflict: "Both modify {file1}, {file2} — potential merge conflict"
   - duplicate: "Near-identical changes as #{other}" 
   - touching: "Shares {file1}, {file2} with #{other}"

### Step 3: Suggested review order
1. Group PRs into "overlap clusters" (connected components where PRs share files).
2. Sort clusters by: most overlaps first, then highest aggregate risk level.
3. Within each cluster, sort PRs by: highest overlap count first, then highest risk level.
4. Independent PRs (no overlaps) go last, sorted by risk level.
5. For each entry, provide a `reason`: "Overlaps with #{list}" or "Independent — review anytime".

### Step 4: Per-PR notes
For each PR key, collect all notes from overlaps involving that PR.
Store as `perPrNotes` for direct lookup by the queue strip.
