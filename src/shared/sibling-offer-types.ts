export interface StructuralOp {
  kind: "add-step" | "remove-step" | "reorder-step" | "add-branch" | "remove-branch";
  description: string;
  position?: number;
  taskName?: string;
  branchType?: "success" | "failure";
}

/** Structural diff between the original and proposed chain shapes.
 *  Contains only topology info, never slot values (command strings, args). */
export interface StructuralDiff {
  sourceLoopId: string;
  sourceEnvironmentId: string;
  operations: StructuralOp[];
  fingerprint: string;
  postEditTopology: ChainTopology;
}

/** Structural topology of a chain, independent of slot values.
 *  Used to match sibling loops that share the same shape. */
export interface ChainTopology {
  steps: Array<{
    taskName: string;
    onSuccessTaskId: string | null;
    onFailureTaskId: string | null;
  }>;
}

export interface SiblingCandidate {
  loopId: string;
  environmentId: string;
  environmentName: string;
  loopDescription: string;
  projectName: string;
}

export interface SiblingDeclineRecord {
  environmentId: string;
  loopId: string;
  fingerprint: string;
  declinedAt: number;
}

export interface SiblingDeclineBridge {
  isDeclined(environmentId: string, loopId: string, fingerprint: string): Promise<boolean>;
  recordDecline(record: Omit<SiblingDeclineRecord, "declinedAt">): Promise<void>;
}

export type SiblingOfferStatus = "pending" | "applying" | "applied" | "declined" | "error";
