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
  | "loop-proposal";

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
  | LoopProposalRow;
