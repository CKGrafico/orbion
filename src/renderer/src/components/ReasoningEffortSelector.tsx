import { useIntl } from "react-intl";
import type { ReasoningEffort } from "../../../shared/ipc";

interface ReasoningEffortSelectorProps {
  /** Currently selected reasoning effort (from session). */
  value: ReasoningEffort | undefined;
  /** Available reasoning efforts for the current model. Undefined = hide. */
  efforts: ReasoningEffort[] | undefined;
  /** Called when the user picks an effort level. */
  onChange: (effort: ReasoningEffort) => void;
}

const EFFORT_LABELS: Record<ReasoningEffort, string> = {
  low: "reasoningEffort.low",
  medium: "reasoningEffort.medium",
  high: "reasoningEffort.high",
};

export function ReasoningEffortSelector({ value, efforts, onChange }: ReasoningEffortSelectorProps): React.ReactNode {
  const intl = useIntl();

  // Hide when the model does not support reasoning effort
  if (!efforts || efforts.length === 0) return null;

  return (
    <div className="segmented" role="radiogroup" aria-label={intl.formatMessage({ id: "reasoningEffort.label" })}>
      {efforts.map((effort) => {
        const isActive = value === effort;

        return (
          <button
            key={effort}
            className={`segment${isActive ? " active" : ""}`}
            role="radio"
            aria-checked={isActive}
            onClick={() => {
              if (!isActive) {
                onChange(effort);
              }
            }}
          >
            {intl.formatMessage({ id: EFFORT_LABELS[effort] })}
          </button>
        );
      })}
    </div>
  );
}
