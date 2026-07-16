import { useState } from "react";
import { useIntl } from "react-intl";
import type { LogRow, RunHeaderLogRow, ToolCallLogRow, MarkdownLogRow, PlainTextLogRow, ExitLogRow } from "./log-types";
import { MarkdownContent } from "../chat/MarkdownContent";
import { ChevronRight, ChevronDown } from "lucide-react";

const TOOL_ICONS: Record<string, string> = {
  read: "📄",
  write: "✏️",
  edit: "🔧",
  bash: "⌨️",
  grep: "🔍",
  glob: "📁",
  search: "🔎",
  fetch: "🌐",
};

const STATUS_GLYPHS: Record<string, string> = {
  running: "●",
  completed: "✓",
  error: "✗",
};

export function RunHeaderRow({ row, expanded, onToggle }: { row: RunHeaderLogRow; expanded: boolean; onToggle: () => void }) {
  const intl = useIntl();
  return (
    <button className="run-card-header" onClick={onToggle}>
      <span className="run-card-chevron">{expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
      <span className="run-card-label">
        {intl.formatMessage({ id: "logRows.runHeader" }, { number: row.runNumber })}
      </span>
      {row.timestamp && <span className="run-card-timestamp">{row.timestamp}</span>}
    </button>
  );
}

function ToolCallLogRowComponent({ row }: { row: ToolCallLogRow }) {
  const intl = useIntl();
  const [expanded, setExpanded] = useState(false);
  const icon = TOOL_ICONS[row.toolKind] ?? "⚙️";
  const statusGlyph = STATUS_GLYPHS[row.status] ?? "●";

  return (
    <div className="log-tool-call-row">
      <button className="log-tool-call-header" onClick={() => setExpanded((e) => !e)}>
        <span className="log-tool-call-icon">{icon}</span>
        <span className="log-tool-call-title">{row.title}</span>
        {row.duration != null && (
          <span className="log-tool-call-duration">{row.duration}ms</span>
        )}
        <span className={`log-tool-call-status log-tool-call-status-${row.status}`}>
          {statusGlyph} {intl.formatMessage({ id: `logRows.${row.status}` })}
        </span>
        <span className="log-tool-call-chevron">{expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}</span>
      </button>
      {expanded && row.output && (
        <div className="log-tool-call-output">
          <div className="log-tool-call-output-header">
            <span className="log-tool-call-output-label">
              {intl.formatMessage({ id: "logRows.output" })}
            </span>
          </div>
          <pre>{row.output}</pre>
        </div>
      )}
    </div>
  );
}

function MarkdownLogRowComponent({ row }: { row: MarkdownLogRow }) {
  return (
    <div className="log-markdown-row">
      <MarkdownContent content={row.content} streaming={row.streaming} />
    </div>
  );
}

function PlainTextRowComponent({ row }: { row: PlainTextLogRow }) {
  return <div className="log-plain-text">{row.text || " "}</div>;
}

function ExitRowComponent({ row }: { row: ExitLogRow }) {
  const intl = useIntl();
  const isOk = row.exitCode === 0;
  return (
    <div className={`log-exit-row ${isOk ? "log-exit-ok" : "log-exit-bad"}`}>
      {intl.formatMessage({ id: "logRows.exitCode" }, { code: row.exitCode })}
      {row.duration != null && ` · ${row.duration}ms`}
    </div>
  );
}

export function LogRowRenderer({ row }: { row: LogRow }) {
  switch (row.kind) {
    case "run-header":
      // Run headers are rendered by RunCard, not individually
      return null;
    case "tool-call":
      return <ToolCallLogRowComponent row={row} />;
    case "markdown":
      return <MarkdownLogRowComponent row={row} />;
    case "plain-text":
      return <PlainTextRowComponent row={row} />;
    case "exit":
      return <ExitRowComponent row={row} />;
  }
}
