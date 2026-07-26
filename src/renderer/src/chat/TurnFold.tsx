import { useTranslation } from "react-i18next";

interface TurnFoldProps {
  toolCallCount: number;
  durationSec: number;
  onClick: () => void;
}

export function TurnFold({ toolCallCount, durationSec, onClick }: TurnFoldProps) {
  const { t } = useTranslation();

  return (
    <button className="transcript-turn-fold" onClick={onClick}>
      <span className="turn-fold-icon">▸</span>
      <span>
        {t("chat.turnFold", { count: toolCallCount, seconds: durationSec })}
      </span>
    </button>
  );
}
