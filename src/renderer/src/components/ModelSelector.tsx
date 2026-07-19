import { useCallback, useEffect, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import type { ModelInfo, ReasoningEffort } from "../../../shared/ipc";
import type { IAgentService } from "../services/interfaces";
import { cid, useInject } from "inversify-hooks";

interface ModelSelectorProps {
  /** The environment ID to query models for. */
  environmentId: string;
  /** Currently selected model ID (from session). */
  value: string | undefined;
  /** Called when the user picks a model. */
  onChange: (modelId: string) => void;
}

export function ModelSelector({ environmentId, value, onChange }: ModelSelectorProps): React.ReactNode {
  const intl = useIntl();
  const [agentService] = useInject<IAgentService>(cid.IAgentService);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void agentService.listModels(environmentId).then((result) => {
      if (cancelled) return;
      if (result.ok && result.models) {
        setModels(result.models);
      }
    });
    return () => { cancelled = true; };
  }, [agentService, environmentId]);

  // Group models by provider
  const grouped = useMemo(() => {
    const groups = new Map<string, ModelInfo[]>();
    for (const model of models) {
      const existing = groups.get(model.provider) ?? [];
      existing.push(model);
      groups.set(model.provider, existing);
    }
    return groups;
  }, [models]);

  // Find the currently selected model's info
  const selectedModel = useMemo(
    () => models.find((m) => m.id === value),
    [models, value],
  );

  const handleSelect = useCallback(
    (modelId: string) => {
      onChange(modelId);
      setOpen(false);
    },
    [onChange],
  );

  // Auto-select first available model if no model is selected
  useEffect(() => {
    if (models.length > 0 && !value) {
      const firstAvailable = models.find((m) => m.available);
      if (firstAvailable) {
        onChange(firstAvailable.id);
      }
    }
  }, [models, value, onChange]);

  if (models.length === 0) return null;

  return (
    <div className="model-selector-wrapper">
      <button
        className="model-selector-trigger"
        onClick={() => setOpen((v) => !v)}
        title={selectedModel?.label ?? intl.formatMessage({ id: "modelSelector.selectModel" })}
      >
        {selectedModel?.label ?? intl.formatMessage({ id: "modelSelector.selectModel" })}
        <span className="model-selector-arrow">{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <div className="model-selector-dropdown">
          {Array.from(grouped.entries()).map(([provider, providerModels]) => (
            <div key={provider} className="model-selector-group">
              <div className="model-selector-group-label">{provider}</div>
              {providerModels.map((model) => {
                const isSelected = model.id === value;
                const isDisabled = !model.available;
                return (
                  <button
                    key={model.id}
                    className={`model-selector-option${isSelected ? " selected" : ""}${isDisabled ? " disabled" : ""}`}
                    disabled={isDisabled}
                    title={isDisabled ? intl.formatMessage(
                      { id: "modelSelector.unavailableReason" },
                      { model: model.label, reason: model.unavailableReason ?? "unavailable" },
                    ) : model.label}
                    onClick={() => handleSelect(model.id)}
                  >
                    <span className="model-selector-option-label">{model.label}</span>
                    {isDisabled ? (
                      <span className="model-selector-option-reason">
                        {model.unavailableReason ?? intl.formatMessage({ id: "modelSelector.unavailable" })}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Get the reasoning efforts for a given model from the model list.
 * Returns undefined if the model is not found or has no reasoning efforts.
 */
export function getReasoningEffortsForModel(models: ModelInfo[], modelId: string | undefined): ReasoningEffort[] | undefined {
  if (!modelId) return undefined;
  const model = models.find((m) => m.id === modelId);
  if (!model) return undefined;
  const efforts = model.reasoningEfforts;
  if (!efforts || efforts.length === 0) return undefined;
  return efforts;
}
