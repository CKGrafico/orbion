import { useTranslation } from "react-i18next";

interface ToolCallsExpanderProps {
  count: number;
  onClick: () => void;
}

export function ToolCallsExpander({ count, onClick }: ToolCallsExpanderProps) {
  const { t } = useTranslation();

  return (
    <button className="transcript-expander" onClick={onClick}>
      <span className="transcript-expander-icon">⋯</span>
      <span>
        {t("chat.earlierToolCalls", { count })}
      </span>
    </button>
  );
}
