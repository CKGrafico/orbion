import React, { useCallback, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import type { ToolCall } from "./types";

const KIND_ICONS: Record<string, string> = {
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

function CodeBlock({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const intl = useIntl();
  const [copied, setCopied] = useState(false);
  const lang = className?.replace("language-", "") ?? "";
  const codeStr = String(children).replace(/\n$/, "");

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codeStr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  }, [codeStr]);

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-block-lang">{lang}</span>
        <button className="code-block-copy" onClick={handleCopy}>
          {copied ? intl.formatMessage({ id: "chat.copied" }) : intl.formatMessage({ id: "chat.copy" })}
        </button>
      </div>
      <pre>
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

export function MarkdownContent({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  const components = useMemo(
    () => ({
      code({
        className,
        children,
        ...props
      }: React.HTMLAttributes<HTMLElement> & { node?: unknown }) {
        const isBlock = className?.startsWith("language-");
        if (isBlock) {
          return (
            <CodeBlock className={className}>{children}</CodeBlock>
          );
        }
        return (
          <code className="inline-code" {...props}>
            {children}
          </code>
        );
      },
      pre({ children }: React.HTMLAttributes<HTMLElement> & { node?: unknown }) {
        return <>{children}</>;
      },
    }),
    [],
  );

  if (!content) {
    return streaming ? (
      <span className="typing-indicator">
        <span />
        <span />
        <span />
      </span>
    ) : null;
  }

  return (
    <div className="markdown-content">
      <Markdown rehypePlugins={[rehypeHighlight]} components={components as never}>
        {content}
      </Markdown>
    </div>
  );
}

export function ToolCallRowView({
  toolCall,
  expanded,
  onToggle,
}: {
  toolCall: ToolCall;
  expanded: boolean;
  onToggle: () => void;
}) {
  const intl = useIntl();
  const [copied, setCopied] = useState(false);
  const icon = KIND_ICONS[toolCall.kind] ?? "⚙️";
  const glyph = STATUS_GLYPHS[toolCall.status] ?? "·";

  const handleCopy = useCallback(async () => {
    if (!toolCall.output) return;
    try {
      await navigator.clipboard.writeText(toolCall.output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  }, [toolCall.output]);

  return (
    <div className={`tool-call-row ${expanded ? "expanded" : ""}`}>
      <button className="tool-call-header" onClick={onToggle}>
        <span className="tool-call-icon">{icon}</span>
        <span className="tool-call-title">{toolCall.title}</span>
        <span
          className={`tool-call-status tool-call-status-${toolCall.status}`}
        >
          {glyph}
        </span>
        <span className="tool-call-chevron">
          {expanded ? "▾" : "▸"}
        </span>
      </button>
      {expanded && toolCall.output ? (
        <div className="tool-call-output">
          <div className="tool-call-output-header">
            <span className="tool-call-output-label">{intl.formatMessage({ id: "chat.output" })}</span>
            <button className="tool-call-copy" onClick={handleCopy}>
              {copied ? intl.formatMessage({ id: "chat.copied" }) : intl.formatMessage({ id: "chat.copy" })}
            </button>
          </div>
          <pre>
            <code>{toolCall.output}</code>
          </pre>
        </div>
      ) : null}
    </div>
  );
}
