import React, { useCallback, useEffect, useRef } from "react";
import { useIntl } from "react-intl";
import type { QuestionRequest } from "./types";

interface QuestionPanelProps {
  question: QuestionRequest;
  onAnswer: (questionId: string, answer: string) => void;
}

export function QuestionPanel({ question, onAnswer }: QuestionPanelProps) {
  const intl = useIntl();
  const containerRef = useRef<HTMLDivElement>(null);
  const [freeText, setFreeText] = React.useState("");

  const handleSubmitFreeText = useCallback(() => {
    if (freeText.trim()) {
      onAnswer(question.id, freeText.trim());
      setFreeText("");
    }
  }, [freeText, question.id, onAnswer]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= question.options.length) {
        e.preventDefault();
        onAnswer(question.id, question.options[num - 1].key);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [question, onAnswer]);

  return (
    <div className="question-panel" ref={containerRef}>
      <div className="question-header">
        <span className="question-icon">?</span>
        <span className="question-title">{question.text}</span>
      </div>
      <div className="question-options">
        {question.options.map((opt, i) => (
          <button
            key={opt.key}
            className="question-option-btn"
            onClick={() => onAnswer(question.id, opt.key)}
            title={intl.formatMessage({ id: "chat.pressNumber" }, { number: i + 1 })}
          >
            <span className="question-option-key">{i + 1}</span>
            <span className="question-option-label">{opt.label}</span>
          </button>
        ))}
      </div>
      {question.allowFreeText && (
        <div className="question-freetext">
          <input
            className="question-freetext-input"
            placeholder={intl.formatMessage({ id: "chat.typeAnswer" })}
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSubmitFreeText();
              }
            }}
          />
          <button
            className="question-freetext-submit"
            onClick={handleSubmitFreeText}
            disabled={!freeText.trim()}
          >
            {intl.formatMessage({ id: "chat.send" })}
          </button>
        </div>
      )}
    </div>
  );
}
