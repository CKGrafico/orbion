import { useCallback, useState } from "react";
import { useIntl } from "react-intl";
import type { ToolCall } from "./types";
import { KIND_ICONS, STATUS_GLYPHS } from "./MarkdownContent";

/** Max lines of output shown before truncation. */
const OUTPUT_PREVIEW_LINES = 6;
const OUTPUT_PREVIEW_CHARS = 500;

interface ToolCallRowProps {
  toolCall: ToolCall;
  expanded: boolean;
  onToggleExpand: (rowId: string) => void;
  rowId: string;
}

export function ToolCallInlineBlock({
  toolCall,
  expanded,
  onToggleExpand,
  rowId,
}: ToolCallRowProps) {
  const intl = useIntl();
  const [outputExpanded, setOutputExpanded] = useState(false);
  const icon = KIND_ICONS[toolCall.kind] ?? "⚙️";
  const statusGlyph = STATUS_GLYPHS[toolCall.status] ?? "·";

  const handleToggleOutput = useCallback(() => {
    setOutputExpanded((prev) => !prev);
  }, []);

  const output = toolCall.output ?? "";
  const outputLines = output.split("\n");
  const isLong =
    outputLines.length > OUTPUT_PREVIEW_LINES ||
    output.length > OUTPUT_PREVIEW_CHARS;

  const displayOutput =
    isLong && !outputExpanded
      ? outputLines.slice(0, OUTPUT_PREVIEW_LINES).join("\n").slice(0, OUTPUT_PREVIEW_CHARS) + "…"
      : output;

  const durationMs = toolCall.finishedAt
    ? toolCall.finishedAt - toolCall.startedAt
    : null;

  return (
    <div className="tool-call-row">
      <button
        className="tool-call-header"
        onClick={() => onToggleExpand(rowId)}
        title={toolCall.title}
      >
        <span className="tool-call-icon">{icon}</span>
        <span className="tool-call-title mono">{toolCall.title}</span>
        {durationMs != null && (
          <span className="tool-call-duration">
            {durationMs >= 1000
              ? `${(durationMs / 1000).toFixed(1)}s`
              : `${durationMs}ms`}
          </span>
        )}
        <span
          className={`tool-call-status tool-call-status-${toolCall.status}`}
        >
          {statusGlyph}
        </span>
      </button>

      {expanded && output && (
        <div className="tool-call-output">
          <div className="tool-call-output-header">
            <span className="tool-call-output-label">
              {intl.formatMessage({ id: "chat.output" })}
            </span>
          </div>
          <pre>{displayOutput}</pre>
          {isLong && (
            <button
              className="tool-call-expand-btn"
              onClick={handleToggleOutput}
            >
              {outputExpanded
                ? intl.formatMessage({ id: "chat.showLess" })
                : intl.formatMessage(
                    { id: "chat.showMore" },
                    { lines: outputLines.length },
                  )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
