import type { I18nMessage } from "./types-common.js";
import type { AgentRuntime, ReasoningEffort, ListModelsResult } from "./types-config.js";

/** Ephemeral by default (persisted = false). Setting persisted = true makes the session a durable sidebar entry. */
export interface ChatSession {
  id: string;
  title: string;
  projectName: string;
  environmentId: string;
  workingDirectory: string;
  activeRuntime: AgentRuntime;
  activeModel?: string;
  reasoningEffort?: ReasoningEffort;
  persisted?: boolean;
  turnCount?: number;
  /** ISO timestamp until which auto-persist offers are suppressed.
   *  When the user declines, this silences offers until reset. */
  declineAutoPersistUntil?: string;
  pinned?: boolean;
  isLoopChat?: boolean;
  loopId?: string;
  sortOrder?: number;
  lastActiveAt: string;
  createdAt: string;
}

export interface ToolCallRecord {
  id: string;
  kind: string;
  title: string;
  status: "running" | "completed" | "error";
  output?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface TranscriptMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCallRecord[];
  startedAt: number;
  finishedAt?: number;
  createdAt: string;
  environmentId?: string;
}

export interface TranscriptBridge {
  getMessages: (sessionId: string) => Promise<TranscriptMessage[]>;
  appendMessage: (message: Omit<TranscriptMessage, "createdAt">) => Promise<TranscriptMessage>;
  appendMessages: (messages: Array<Omit<TranscriptMessage, "createdAt">>) => Promise<TranscriptMessage[]>;
  updateMessage: (messageId: string, updates: Partial<Pick<TranscriptMessage, "content" | "toolCalls" | "finishedAt">>) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
}

export interface AgentSendPromptArgs {
  environmentId: string;
  prompt: string;
  sessionId?: string;
  chatSessionId: string;
  turnId: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
}

export type AgentStreamEvent =
  | { kind: "text-delta"; chatSessionId: string; turnId: string; text: string }
  | { kind: "tool-call-start"; chatSessionId: string; turnId: string; toolCallId: string; toolName: string; title: string }
  | { kind: "tool-call-output"; chatSessionId: string; turnId: string; toolCallId: string; output: string; status: "completed" | "error" }
  | { kind: "turn-finished"; chatSessionId: string; turnId: string }
  | { kind: "turn-error"; chatSessionId: string; turnId: string; error: string }
  | { kind: "turn-interrupted"; chatSessionId: string; turnId: string };

export interface AgentSendPromptResult {
  ok: boolean;
  sessionId?: string;
  error?: string | I18nMessage;
}

export interface AgentBridge {
  sendPrompt: (args: AgentSendPromptArgs) => Promise<AgentSendPromptResult>;
  interrupt: (environmentId: string, sessionId?: string) => Promise<void>;
  onStreamEvent: (cb: (event: AgentStreamEvent) => void) => () => void;
  listModels: (environmentId: string) => Promise<ListModelsResult>;
}

/**
 * MCP tool advertised by a loop-task daemon's MCP server.
 * Tool names are discovered at runtime — never hard-coded or invented.
 */
export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpToolCallResult {
  ok: boolean;
  /** Must be structured-clone-serializable when crossing IPC. */
  data?: unknown;
  error?: string | I18nMessage;
}

/** - "connected": tools available and callable.
 *  - "connecting": handshake / tool discovery in progress.
 *  - "unreachable": MCP server not responding.
 *  - "error": MCP server responded with an error. */
export type McpConnectionState = "connected" | "connecting" | "unreachable" | "error";

export interface McpConnectionStatus {
  environmentId: string;
  state: McpConnectionState;
  tools: McpToolInfo[];
  lastError: string | I18nMessage | null;
  connectedAt: number | null;
}

export interface McpBridge {
  getStatus: (environmentId: string) => Promise<McpConnectionStatus>;
  connect: (environmentId: string) => Promise<McpConnectionStatus>;
  disconnect: (environmentId: string) => Promise<void>;
  /** Tool name must come from getStatus().tools. */
  callTool: (environmentId: string, toolName: string, args: Record<string, unknown>) => Promise<McpToolCallResult>;
  onStatusChange: (cb: (status: McpConnectionStatus) => void) => () => void;
}
