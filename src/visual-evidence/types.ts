/**
 * Input/output schemas for the visual-evidence capability.
 * evidence.json uses version 1 shaped as {@link EvidenceManifest}.
 */

// ── Input ──

export type EvidenceTypePreference = "auto" | "screenshot" | "gif" | "video";

export interface IssueContext {
  readonly number: number;
  readonly title: string;
  readonly description: string;
  readonly acceptanceCriteria: readonly string[];
}

export interface ScenarioInstruction {
  readonly title: string;
  readonly steps: readonly string[];
}

export interface EvidenceInput {
  readonly changeId: string;
  readonly issue?: IssueContext;
  readonly changedFiles?: readonly string[];
  readonly scenario?: ScenarioInstruction;
  readonly preferredEvidenceType?: EvidenceTypePreference;
  readonly expectedStartingState?: string;
  readonly prNumber?: number;
  readonly branchName?: string;
  readonly commitSha?: string;
}

// ── Context read from OpenSpec change on disk ──

export interface ChangeContext {
  readonly changeId: string;
  readonly changeDir: string;
  readonly proposal?: string;
  readonly tasks?: string;
  readonly archive?: string;
  readonly acceptanceCriteria: readonly string[];
  readonly affectedFiles: readonly string[];
  readonly active: boolean;
}

// ── Scenario + assertions ──

export interface Scenario {
  readonly title: string;
  readonly steps: readonly string[];
}

export type AssertionStatus = "passed" | "failed";

export interface AssertionResult {
  readonly description: string;
  readonly status: AssertionStatus;
  readonly error?: string;
}

export interface EvidenceCriterion {
  readonly id: string;
  readonly description: string;
  readonly assertionDescriptions: readonly string[];
  readonly captureLabels: readonly string[];
}

export interface ScenarioEvidenceContract {
  readonly criteria: readonly EvidenceCriterion[];
}

// ── Assets ──

export type AssetType = "screenshot" | "gif" | "video";
export type ImageFormat = "webp" | "png";
export type GifFormat = "gif";

export interface ScreenshotAsset {
  readonly type: "screenshot";
  readonly path: string;
  readonly caption: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly format: ImageFormat;
}

export interface GifAsset {
  readonly type: "gif";
  readonly path: string;
  readonly caption: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly durationSeconds: number;
  readonly bytes: number;
  readonly format: GifFormat;
}

export type EvidenceAsset = ScreenshotAsset | GifAsset;

// ── Temporary artifacts (kept only on failure) ──

export interface TemporaryArtifacts {
  readonly screenshot?: string;
  readonly video?: string;
  readonly trace?: string;
}

// ── Result ──

export type EvidenceStatus = "passed" | "skipped" | "failed" | "blocked";

export interface EvidenceResultBase {
  readonly version: 1;
  readonly changeId: string;
  readonly required: boolean;
  readonly status: EvidenceStatus;
  readonly assets: readonly EvidenceAsset[];
  readonly prMarkdown: string;
}

export interface PassedEvidenceResult extends EvidenceResultBase {
  readonly status: "passed";
  readonly required: true;
  readonly scenario: Scenario;
  readonly assertions: readonly AssertionResult[];
}

export interface SkippedEvidenceResult extends EvidenceResultBase {
  readonly status: "skipped";
  readonly required: false;
  readonly reason: string;
}

export interface FailedEvidenceResult extends EvidenceResultBase {
  readonly status: "failed";
  readonly required: true;
  readonly scenario?: Scenario;
  readonly assertions?: readonly AssertionResult[];
  readonly failedStep: string;
  readonly error: string;
  readonly temporaryArtifacts: TemporaryArtifacts;
}

export interface BlockedEvidenceResult extends EvidenceResultBase {
  readonly status: "blocked";
  readonly required: boolean;
  readonly reason: string;
  readonly failedStep?: string;
}

export type EvidenceResult =
  | PassedEvidenceResult
  | SkippedEvidenceResult
  | FailedEvidenceResult
  | BlockedEvidenceResult;

// ── Manifest (evidence.json) ──

/** Same shape as {@link EvidenceResult}; serialized with JSON.stringify so undefined fields are omitted. */
export type EvidenceManifest = EvidenceResult;

// ── Repo coordinates for PR markdown URLs ──

export interface RepoCoordinates {
  readonly owner: string;
  readonly name: string;
}

// ── Capture-candidate (before size enforcement) ──

export interface CaptureCandidate {
  readonly type: AssetType;
  readonly buffer: Buffer;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly format: string;
  readonly fps?: number;
  readonly durationSeconds?: number;
  readonly caption: string;
}
