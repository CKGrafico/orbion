import type { ChainStep } from "../components/TaskChainView";
import type { SimilarLoopMatch } from "../fleet-similarity";
import type { ShapeAdaptation } from "../fleet-shape-adapt";
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
  /** Timestamp when the message finished streaming, or true if finished. Undefined if still streaming. */
  finishedAt?: number | boolean;
  /** The environment (instance) that produced this message. */
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
  | "failure-diagnosis";

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
  /** The instance that produced this message, used for "on <instance>" attribution. */
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
  /** The instance name the session was running on before the switch. */
  fromInstance: string;
  /** The instance name the session is now running on. */
  toInstance: string;
}

export interface LoopCardRow extends BaseRow {
  kind: "loop-card";
  /** The loop ID to look up from the loop store. */
  loopId: string;
  /** The environment (instance) that owns this loop. */
  environmentId: string;
}

export interface FailureDiagnosisRow extends BaseRow {
  kind: "failure-diagnosis";
  /** The loop ID this diagnosis is for. */
  loopId: string;
  /** The environment (instance) that owns this loop. */
  environmentId: string;
  /** Broad failure category. */
  category: FailureCategory;
  /** Short diagnosis summary (i18n key or plain text). */
  summary: string;
  /** Recommended next step (i18n key or plain text). */
  nextStep: string;
  /** Confidence of the diagnosis. */
  confidence: "high" | "medium" | "low";
}

export type LoopProposalStatus = "pending" | "approved" | "rejected" | "creating" | "created" | "error";

export interface LoopProposalRow extends BaseRow {
  kind: "loop-proposal";
  /** Unique proposal identifier for tracking state. */
  proposalId: string;
  /** The shell command to run. */
  command: string;
  /** Command arguments. */
  commandArgs: string[];
  /** Interval syntax (e.g., "30s", "5m", "1h", "1d", "1w"). */
  interval: string;
  /** Target project ID. */
  projectId: string;
  /** Target project display name. */
  projectName: string;
  /** Whether to trigger the first run right away. */
  runImmediately: boolean;
  /** Cap on number of runs (null = unlimited). */
  maxRuns: number | null;
  /** The suggested cap (only set for agent commands when maxRuns is null). */
  suggestedMaxRuns: number | null;
  /** Which environment to create the loop on. */
  environmentId: string;
  /** Current status of the proposal. */
  status: LoopProposalStatus;
  /** Populated after successful creation. */
  createdLoopId: string | null;
  /** Populated on creation error. */
  error: string | null;
  /** Similar loops from other reachable instances, computed transiently. */
  similarLoops?: SimilarLoopMatch[];
  /** Provenance string, e.g. "Based on your implement-issue loop on prod-vm, adapted for Azure DevOps". Null if no shape match. */
  provenance: string | null;
  /** Source shape metadata when the proposal was pre-shaped from a fleet match. */
  adaptedFrom?: ShapeAdaptation | null;
}

/** Status lifecycle for a chain-edit proposal. */
export type ChainEditProposalStatus = "pending" | "applying" | "applied" | "rejected" | "error";

/** Summary of a single operation within a chain edit proposal. */
export interface ChainEditOperationSummary {
  /** Human-readable description of the operation (e.g., "Add step: Run tests after Build"). */
  description: string;
  /** The type of operation. */
  kind: "create-task" | "update-task" | "delete-task";
}

/** Warning shown when a chain-edit proposal modifies a task shared by multiple loops. */
export interface SharedTaskWarning {
  /** The IDs of shared tasks being modified by this proposal. */
  taskIds: string[];
  /** Loops (other than the one being edited) that reference the shared task(s). */
  referencingLoops: Array<{ loopId: string; loopName: string }>;
  /** The user's decision on how to handle the shared task. Null = pending decision. */
  decision: null | "change-all" | "fork-copy";
}

/** A row representing a proposed chain edit, rendered as a preview card. */
export interface ChainEditProposalRow extends BaseRow {
  kind: "chain-edit-proposal";
  /** Unique proposal identifier. */
  proposalId: string;
  /** The loop ID whose chain is being edited. */
  loopId: string;
  /** The environment (instance) that owns this loop. */
  environmentId: string;
  /** The proposed task chain steps for preview (resolved from proposed operations). */
  proposedSteps: ChainStep[];
  /** Human-readable summaries of the operations being proposed. */
  operationSummaries: ChainEditOperationSummary[];
  /** Current status of the proposal. */
  status: ChainEditProposalStatus;
  /** Populated on apply error. */
  error: string | null;
  /** Warning about shared task references, shown before approve/reject. */
  sharedTaskWarning?: SharedTaskWarning;
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
  | FailureDiagnosisRow;
