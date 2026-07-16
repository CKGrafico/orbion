/**
 * Structured log row types for component-based log rendering.
 * Mirrors the TranscriptRow pattern from the chat system but tailored for loop output.
 */

export type LogRowKind =
  | "run-header"
  | "tool-call"
  | "markdown"
  | "plain-text"
  | "exit";

export interface BaseLogRow {
  id: string;
  kind: LogRowKind;
}

export interface RunHeaderLogRow extends BaseLogRow {
  kind: "run-header";
  runNumber: number;
  timestamp: string | null;
}

export interface ToolCallLogRow extends BaseLogRow {
  kind: "tool-call";
  toolKind: string;
  title: string;
  status: "running" | "completed" | "error";
  output?: string;
  duration?: number;
}

export interface MarkdownLogRow extends BaseLogRow {
  kind: "markdown";
  content: string;
  streaming?: boolean;
}

export interface PlainTextLogRow extends BaseLogRow {
  kind: "plain-text";
  text: string;
}

export interface ExitLogRow extends BaseLogRow {
  kind: "exit";
  exitCode: number;
  duration?: number;
}

export type LogRow =
  | RunHeaderLogRow
  | ToolCallLogRow
  | MarkdownLogRow
  | PlainTextLogRow
  | ExitLogRow;

/**
 * Structured event payload parsed from StreamEventPayload when kind === "event".
 * The daemon may emit these as JSON strings in the event stream.
 */
export type LogEventType = "tool_call" | "markdown" | "approval";

export interface ToolCallEvent {
  type: "tool_call";
  id: string;
  kind: string;
  title: string;
  status: "running" | "completed" | "error";
  output?: string;
  duration?: number;
}

export interface MarkdownEvent {
  type: "markdown";
  content: string;
  streaming?: boolean;
}

export interface ApprovalEvent {
  type: "approval";
  id: string;
  command?: string;
  description: string;
}

export type LogEventPayload =
  | ToolCallEvent
  | MarkdownEvent
  | ApprovalEvent;

/**
 * A run segment groups LogRows belonging to a single run.
 */
export interface RunSegment {
  runNumber: number;
  rows: LogRow[];
  expanded: boolean;
}

/**
 * Attempt to parse a stream event text as a structured LogEventPayload.
 * Returns null if the text is not valid JSON or does not match expected shapes.
 */
export function parseLogEvent(text: string): LogEventPayload | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && typeof parsed.type === "string") {
      if (parsed.type === "tool_call" || parsed.type === "markdown" || parsed.type === "approval") {
        return parsed as LogEventPayload;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Classify a plain text log line into a LogRow kind.
 * Returns the kind and extracted metadata.
 */
export function classifyLogLine(line: string): { kind: LogRowKind; runNumber?: number; exitCode?: number } {
  const runMatch = line.match(/=== Run #(\d+)/);
  if (runMatch) {
    return { kind: "run-header", runNumber: parseInt(runMatch[1], 10) };
  }
  const exitOkMatch = line.match(/\bexit 0\b/);
  if (exitOkMatch) {
    return { kind: "exit", exitCode: 0 };
  }
  const exitBadMatch = line.match(/\bexit ([1-9]\d*)\b/);
  if (exitBadMatch) {
    return { kind: "exit", exitCode: parseInt(exitBadMatch[1], 10) };
  }
  return { kind: "plain-text" };
}
