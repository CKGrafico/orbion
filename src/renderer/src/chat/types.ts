import type { ChainStep } from "../components/TaskChainView";
import type { SimilarLoopMatch } from "../fleet-similarity";
import type { ShapeAdaptation } from "../fleet-shape-adapt";
import type { StructuralDiff, SiblingCandidate, SiblingOfferStatus } from "../../../shared/sibling-offer-types";
import type { PrVerdict } from "../../../shared/ipc";
import type { FailureCategory } from "./diagnoseFailure";

export type ToolCallStatus = "running" | "completed" | "error";

export interface ToolCall {
  id: string;
  kind: string;
  title: string;
  status: ToolCallStatus;
  output?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  startedAt: number;
  finishedAt?: number;
  environmentId?: string;
}

export type AccessMode = "supervised" | "full";

export type ApprovalDecision = "approve-once" | "approve-always" | "decline" | "cancel";

export interface ApprovalRequest {
  id: string;
  turnId: string;
  command?: string;
  filePath?: string;
  description: string;
  resolved: boolean;
  decision?: ApprovalDecision;
}

export interface QuestionOption {
  key: string;
  label: string;
}

export interface QuestionRequest {
  id: string;
  turnId: string;
  text: string;
  options: QuestionOption[];
  singleChoice: boolean;
  allowFreeText: boolean;
  resolved: boolean;
  answer?: string;
}

export interface ChatTurn {
  id: string;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  finished: boolean;
  collapsed: boolean;
  accessMode: AccessMode;
  approval?: ApprovalRequest;
  question?: QuestionRequest;
  interrupted?: boolean;
}

export type RowKind =
  | "user-message"
  | "assistant-message"
  | "tool-call"
  | "tool-calls-expander"
  | "turn-fold"
  | "approval-request"
  | "question-request"
  | "instance-handoff"
  | "loop-card"
  | "loop-proposal"
  | "chain-edit-proposal"
  | "sibling-offer"
  | "failure-diagnosis"
  | "pr-reference-card"
  | "fleet-plan";

export interface BaseRow {
  id: string;
  kind: RowKind;
  turnId: string;
}

export interface UserMessageRow extends BaseRow {
  kind: "user-message";
  content: string;
}

export interface AssistantMessageRow extends BaseRow {
  kind: "assistant-message";
  content: string;
  streaming: boolean;
  environmentId?: string;
}

export interface ToolCallRow extends BaseRow {
  kind: "tool-call";
  toolCall: ToolCall;
  expanded: boolean;
}

export interface ToolCallsExpanderRow extends BaseRow {
  kind: "tool-calls-expander";
  count: number;
}

export interface TurnFoldRow extends BaseRow {
  kind: "turn-fold";
  toolCallCount: number;
  durationSec: number;
}

export interface ApprovalRow extends BaseRow {
  kind: "approval-request";
  approval: ApprovalRequest;
}

export interface QuestionRow extends BaseRow {
  kind: "question-request";
  question: QuestionRequest;
}

export interface InstanceHandoffRow extends BaseRow {
  kind: "instance-handoff";
  fromInstance: string;
  toInstance: string;
}

export interface LoopCardRow extends BaseRow {
  kind: "loop-card";
  loopId: string;
  environmentId: string;
}

export interface FailureDiagnosisRow extends BaseRow {
  kind: "failure-diagnosis";
  loopId: string;
  environmentId: string;
  category: FailureCategory;
  summary: string;
  nextStep: string;
  confidence: "high" | "medium" | "low";
}

export type LoopProposalStatus = "pending" | "approved" | "rejected" | "creating" | "created" | "error";

export interface LoopProposalRow extends BaseRow {
  kind: "loop-proposal";
  proposalId: string;
  command: string;
  commandArgs: string[];
  interval: string;
  projectId: string;
  projectName: string;
  runImmediately: boolean;
  maxRuns: number | null;
  suggestedMaxRuns: number | null;
  environmentId: string;
  status: LoopProposalStatus;
  createdLoopId: string | null;
  error: string | null;
  similarLoops?: SimilarLoopMatch[];
  provenance: string | null;
  adaptedFrom?: ShapeAdaptation | null;
}

export type ChainEditProposalStatus = "pending" | "applying" | "applied" | "rejected" | "error";

export interface ChainEditOperationSummary {
  description: string;
  kind: "create-task" | "update-task" | "delete-task";
}

export interface SharedTaskWarning {
  taskIds: string[];
  referencingLoops: Array<{ loopId: string; loopName: string }>;
  decision: null | "change-all" | "fork-copy";
}

export interface ChainEditProposalRow extends BaseRow {
  kind: "chain-edit-proposal";
  proposalId: string;
  loopId: string;
  environmentId: string;
  proposedSteps: ChainStep[];
  operationSummaries: ChainEditOperationSummary[];
  status: ChainEditProposalStatus;
  error: string | null;
  sharedTaskWarning?: SharedTaskWarning;
}

export interface SiblingOfferRow extends BaseRow {
  kind: "sibling-offer";
  offerId: string;
  siblingLoopId: string;
  siblingEnvironmentId: string;
  siblingEnvironmentName: string;
  siblingLoopDescription: string;
  structuralDiff: StructuralDiff;
  status: SiblingOfferStatus;
  error: string | null;
}

export type FleetPlanTargetStatus = "pending" | "running" | "ok" | "failed" | "skipped";

export type FleetPlanStatus = "pending" | "applying" | "applied" | "cancelled";

export interface FleetPlanTarget {
  targetId: string;
  environmentId: string;
  environmentName: string;
  projectId: string;
  projectName: string;
  operation: string;
  checked: boolean;
  status: FleetPlanTargetStatus;
  error: string | null;
}

export interface FleetPlanRow extends BaseRow {
  kind: "fleet-plan";
  planId: string;
  description: string;
  targets: FleetPlanTarget[];
  status: FleetPlanStatus;
  error: string | null;
}

export interface PrReferenceCardRow extends BaseRow {
  kind: "pr-reference-card";
  prNumber: number;
  prTitle: string;
  prRepo: string;
  prAuthor: string;
  prUrl: string;
  prVerdict?: PrVerdict;
}

export type TranscriptRow =
  | UserMessageRow
  | AssistantMessageRow
  | ToolCallRow
  | ToolCallsExpanderRow
  | TurnFoldRow
  | ApprovalRow
  | QuestionRow
  | InstanceHandoffRow
  | LoopCardRow
  | LoopProposalRow
  | ChainEditProposalRow
  | SiblingOfferRow
  | FailureDiagnosisRow
  | PrReferenceCardRow
  | FleetPlanRow;
