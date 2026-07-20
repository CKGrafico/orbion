// Shared types for the sibling structural-offer feature.
// Used by main (decline store), preload (bridge), and renderer (service + types).

// ── Structural diff ──────────────────────────────────────────────────

/** Describes a single structural operation in a chain edit. */
export interface StructuralOp {
  /** The type of structural operation. */
  kind: "add-step" | "remove-step" | "reorder-step" | "add-branch" | "remove-branch";
  /** Human-readable description (i18n key or plain text). */
  description: string;
  /** Step index or position info. */
  position?: number;
  /** The task name of the affected step (for display). */
  taskName?: string;
  /** Branch type if this is a branch operation. */
  branchType?: "success" | "failure";
}

/** The structural diff between the original and proposed chain shapes.
 *  This is what gets offered to sibling loops. It contains only
 *  topology info, never slot values (command strings, args). */
export interface StructuralDiff {
  /** The loop ID that was originally edited (source of this diff). */
  sourceLoopId: string;
  /** The environment ID where the source edit was applied. */
  sourceEnvironmentId: string;
  /** The structural operations in order. */
  operations: StructuralOp[];
  /** A fingerprint hash of the structural operations, used for decline memory. */
  fingerprint: string;
  /** The chain-step topology (task names + branch structure, no commands) after the edit. */
  postEditTopology: ChainTopology;
}

/** The structural topology of a chain, independent of slot values.
 *  Used to match sibling loops that share the same shape. */
export interface ChainTopology {
  /** Steps with their task names and branch structure, no command strings. */
  steps: Array<{
    taskName: string;
    onSuccessTaskId: string | null;
    onFailureTaskId: string | null;
  }>;
}

/** A candidate sibling loop that shares the same structural shape. */
export interface SiblingCandidate {
  /** The sibling loop's ID. */
  loopId: string;
  /** The environment (instance) that hosts this sibling loop. */
  environmentId: string;
  /** Human-readable environment name. */
  environmentName: string;
  /** The sibling loop's description/name. */
  loopDescription: string;
  /** The project name on the sibling instance. */
  projectName: string;
}

// ── Decline memory ───────────────────────────────────────────────────

/** A persisted decline record for a sibling structural offer. */
export interface SiblingDeclineRecord {
  /** The environment ID of the sibling loop that was declined. */
  environmentId: string;
  /** The loop ID of the sibling loop that was declined. */
  loopId: string;
  /** The structural-change fingerprint that was declined. */
  fingerprint: string;
  /** When the decline was recorded. */
  declinedAt: number;
}

// ── IPC Bridge types ─────────────────────────────────────────────────

export interface SiblingDeclineBridge {
  /** Check whether a specific (environmentId, loopId, fingerprint) combination has been declined. */
  isDeclined(environmentId: string, loopId: string, fingerprint: string): Promise<boolean>;
  /** Record a decline. */
  recordDecline(record: Omit<SiblingDeclineRecord, "declinedAt">): Promise<void>;
}

// ── Row status ───────────────────────────────────────────────────────

export type SiblingOfferStatus = "pending" | "applying" | "applied" | "declined" | "error";
