import { useIntl } from "react-intl";

interface TurnFoldProps {
  toolCallCount: number;
  durationSec: number;
  onClick: () => void;
}

export function TurnFold({ toolCallCount, durationSec, onClick }: TurnFoldProps) {
  const intl = useIntl();

  return (
    <button className="transcript-turn-fold" onClick={onClick}>
      <span className="turn-fold-icon">▸</span>
      <span>
        {intl.formatMessage(
          { id: "chat.turnFold" },
          { count: toolCallCount, seconds: durationSec },
        )}
      </span>
    </button>
  );
}
