import { useState } from "react";
import { useIntl } from "react-intl";
import { translateMessage } from "../i18n";
import type { StaleConfigResult, PullRestoreResult } from "../../../shared/ipc";

/**
 * Stale-config warning dialog: shown when a stamp-checked write detects
 * that the config was modified on another machine.
 * Offers two choices: pull-remote (replace local with config-home) or
 * overwrite-anyway (force the write, last-write-wins).
 */
export function StaleConfigWarning({
  staleResult,
  onPullRemote,
  onOverwriteAnyway,
  onCancel,
}: {
  staleResult: StaleConfigResult;
  onPullRemote: () => Promise<PullRestoreResult>;
  onOverwriteAnyway: () => Promise<void>;
  onCancel: () => void;
}): React.ReactNode {
  const intl = useIntl();
  const [acting, setActing] = useState<"pull" | "overwrite" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePullRemote(): Promise<void> {
    setActing("pull");
    setError(null);
    const result = await onPullRemote();
    if (!result.ok) {
      setActing(null);
      setError(translateMessage(intl, result.error) ?? intl.formatMessage({ id: "staleConfig.pullFailed" }, { error: "Unknown error" }));
    }
    // On success, the parent component handles state changes
  }

  async function handleOverwriteAnyway(): Promise<void> {
    setActing("overwrite");
    setError(null);
    try {
      await onOverwriteAnyway();
    } catch (err) {
      setActing(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal stale-config-modal">
        <h2 className="modal-title">
          {intl.formatMessage({ id: "staleConfig.title" })}
        </h2>
        <p className="modal-body">
          {intl.formatMessage({ id: "staleConfig.description" })}
        </p>
        {error && (
          <p className="stale-config-error">{error}</p>
        )}
        <div className="modal-actions">
          {acting ? (
            <span className="stale-config-progress">
              {acting === "pull"
                ? intl.formatMessage({ id: "staleConfig.pulling" })
                : intl.formatMessage({ id: "staleConfig.overwriteSucceeded" })}
            </span>
          ) : (
            <>
              <button
                className="btn primary"
                onClick={() => void handlePullRemote()}
              >
                {intl.formatMessage({ id: "staleConfig.pullRemote" })}
              </button>
              <button
                className="btn secondary"
                onClick={() => void handleOverwriteAnyway()}
              >
                {intl.formatMessage({ id: "staleConfig.overwriteAnyway" })}
              </button>
              <button
                className="btn ghost"
                onClick={onCancel}
              >
                {intl.formatMessage({ id: "restore.skipAction" })}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
