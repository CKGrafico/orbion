import { useIntl } from "react-intl";

interface ToolCallsExpanderProps {
  count: number;
  onClick: () => void;
}

export function ToolCallsExpander({ count, onClick }: ToolCallsExpanderProps) {
  const intl = useIntl();

  return (
    <button className="transcript-expander" onClick={onClick}>
      <span className="transcript-expander-icon">⋯</span>
      <span>
        {intl.formatMessage(
          { id: "chat.earlierToolCalls" },
          { count },
        )}
      </span>
    </button>
  );
}
