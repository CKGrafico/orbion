import type { I18nMessage } from "./types-common.js";

export type PlatformType = "github" | "ado" | "unknown";

export interface DetectPlatformParams {
  environmentId: string;
  projectId?: string;
  directory?: string;
  force?: boolean;
}

export interface PlatformDetectionResult {
  platform: PlatformType;
  remotes: string[];
  cached: boolean;
}

export type InfraAction = "machine-status" | "clone-repo" | "create-issue" | "detect-platform" | "list-issues" | "add-label" | "edit-issue" | "bulk-relabel" | "list-prs-awaiting-review" | "get-pr-verdict" | "get-pr-diff" | "get-pr-briefing" | "submit-pr-review" | "open-pr-in-browser";

export interface CloneRepoParams {
  repoUrl: string;
  targetVmId?: string;
}

export interface CreateIssueParams {
  title: string;
  body: string;
  labels?: string[];
  repo?: string;
  projectId?: string;
}

export interface CreateIssueResult {
  platform: "github" | "ado";
  url: string;
  number?: number;
}

export interface ListIssuesParams {
  labels?: string;
  state?: "open" | "closed" | "all";
  repo?: string;
  limit?: number;
}

export interface IssueCard {
  number: number;
  title: string;
  url: string;
  labels: string[];
  state: "open" | "closed";
  createdAt: string;
  updatedAt: string;
}

export interface ListIssuesResult {
  platform: "github" | "ado";
  issues: IssueCard[];
  total: number;
  truncated: boolean;
}

export interface MachineStatusEntry {
  id: string;
  name: string;
  health: string;
  endpoints: Array<{ url: string; kind: string }>;
}

export interface AddLabelParams {
  issueNumber: number;
  labels: string[];
  repo?: string;
}

export interface AddLabelResult {
  issueNumber: number;
  labels: string[];
}

export interface EditIssueParams {
  issueNumber: number;
  title?: string;
  body?: string;
  addLabels?: string[];
  removeLabels?: string[];
  repo?: string;
  projectId?: string;
}

export interface EditIssueResult {
  platform: "github" | "ado";
  issueNumber: number;
  changes: {
    title?: boolean;
    body?: boolean;
    labelsAdded?: string[];
    labelsRemoved?: string[];
  };
}

export interface BulkRelabelParams {
  issueNumbers: number[];
  addLabels: string[];
  removeLabels?: string[];
  repo?: string;
}

export interface BulkRelabelItemResult {
  issueNumber: number;
  ok: boolean;
  error?: string;
}

export interface BulkRelabelResult {
  items: BulkRelabelItemResult[];
  succeeded: number;
  failed: number;
}

export interface PrAwaitingReviewItem {
  number: number;
  title: string;
  repo: string;
  author: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  /** Used for verdict cache invalidation. */
  headSha: string;
}

export type PrRiskLevel = "low" | "medium" | "high" | "uncertain";

export interface PrVerdict {
  verdict: string;
  riskLevel: PrRiskLevel;
}

export interface ReviewModeItem {
  repo: string;
  number: number;
  title: string;
  author: string;
  url: string;
  headSha: string;
  verdict?: PrVerdict;
}

export interface GetPrVerdictParams {
  repo: string;
  number: number;
}

export interface GetPrVerdictResult {
  verdict: PrVerdict;
}

export interface DiffFileEntry {
  path: string;
  additions: number;
  deletions: number;
  isBinary: boolean;
}

export interface GetPrDiffParams {
  repo: string;
  number: number;
  path?: string;
}

export interface GetPrDiffResult {
  diff: string;
  files: DiffFileEntry[];
  truncated: boolean;
}

export interface BriefingFileGroup {
  label: string;
  additions: number;
  deletions: number;
  files: DiffFileEntry[];
}

export interface BriefingSection {
  kind: "flagged" | "boilerplate";
  title: string;
  files: DiffFileEntry[];
  group?: BriefingFileGroup;
}

export interface GetPrBriefingParams {
  repo: string;
  number: number;
}

export interface GetPrBriefingResult {
  sections: BriefingSection[];
  summary: string;
  totalFlagged: number;
  totalBoilerplate: number;
}

export interface ListPrsAwaitingReviewParams {
  repo?: string;
  limit?: number;
}

export interface ListPrsAwaitingReviewResult {
  platform: "github";
  prs: PrAwaitingReviewItem[];
  total: number;
  truncated: boolean;
}

export type PrReviewEvent = "APPROVE" | "REQUEST_CHANGES";

export interface SubmitPrReviewParams {
  repo: string;
  number: number;
  event: PrReviewEvent;
  body?: string;
}

export interface SubmitPrReviewResult {
  platform: "github" | "ado";
  number: number;
  event: PrReviewEvent;
}

export interface OpenPrInBrowserParams {
  url: string;
}

export type OverlapKind = "conflict" | "duplicate" | "touching";

export interface PrOverlap {
  prA: string;
  prB: string;
  kind: OverlapKind;
  sharedFiles: string[];
  note: string;
}

export interface ReviewOrderEntry {
  prKey: string;
  number: number;
  reason: string;
}

export interface BatchOverlapResult {
  overlaps: PrOverlap[];
  suggestedOrder: ReviewOrderEntry[];
  perPrNotes: Record<string, string[]>;
}

export type InfraActionArgs =
  | { action: "machine-status" }
  | { action: "clone-repo"; params: CloneRepoParams }
  | { action: "create-issue"; params: CreateIssueParams }
  | { action: "detect-platform"; params: DetectPlatformParams }
  | { action: "list-issues"; params?: ListIssuesParams }
  | { action: "add-label"; params: AddLabelParams }
  | { action: "edit-issue"; params: EditIssueParams }
  | { action: "bulk-relabel"; params: BulkRelabelParams }
  | { action: "list-prs-awaiting-review"; params?: ListPrsAwaitingReviewParams }
  | { action: "get-pr-verdict"; params: GetPrVerdictParams }
  | { action: "get-pr-diff"; params: GetPrDiffParams }
  | { action: "get-pr-briefing"; params: GetPrBriefingParams }
  | { action: "submit-pr-review"; params: SubmitPrReviewParams }
  | { action: "open-pr-in-browser"; params: OpenPrInBrowserParams };

export interface InfraActionResult {
  ok: boolean;
  data?: unknown;
  error?: string | I18nMessage;
}

export interface InfraBridge {
  executeAction: (args: InfraActionArgs) => Promise<InfraActionResult>;
  getStatus: () => Promise<{ mainVmId: string | null; connected: boolean }>;
  getPlatform: (environmentId: string, projectId: string) => Promise<PlatformType>;
}
