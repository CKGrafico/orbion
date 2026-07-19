import { useState } from "react";
import { useIntl } from "react-intl";
import { translateMessage } from "../i18n";
import type { RestoreAvailability, PullRestoreResult } from "../../../shared/ipc";

/**
 * Restore-offer dialog: shown when a config-home VM has a config file
 * available for pull-canonical restore.
 */
export function RestoreOffer({
  availability,
  onRestore,
  onSkip,
}: {
  availability: RestoreAvailability & { available: true };
  onRestore: () => Promise<PullRestoreResult>;
  onSkip: () => void;
}): React.ReactNode {
  const intl = useIntl();
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRestore(): Promise<void> {
    setRestoring(true);
    setError(null);
    const result = await onRestore();
    if (!result.ok) {
      setRestoring(false);
      setError(translateMessage(intl, result.error) ?? intl.formatMessage({ id: "restore.restoreFailed" }, { error: "Unknown error" }));
    }
    // On success, the parent component will handle state changes
  }

  return (
    <div className="modal-backdrop">
      <div className="modal restore-offer-modal">
        <h2 className="modal-title">
          {intl.formatMessage({ id: "restore.availableTitle" })}
        </h2>
        <p className="modal-body">
          {intl.formatMessage(
            { id: "restore.availableCopy" },
            {
              count: availability.environmentCount,
              names: availability.environmentNames.join(", "),
            },
          )}
        </p>
        {error && (
          <p className="restore-offer-error">{error}</p>
        )}
        <div className="modal-actions">
          {restoring ? (
            <span className="restore-offer-progress">
              {intl.formatMessage({ id: "restore.restoringTitle" })}
            </span>
          ) : (
            <>
              <button className="btn primary" onClick={() => void handleRestore()}>
                {intl.formatMessage({ id: "restore.restoreAction" })}
              </button>
              <button className="btn secondary" onClick={onSkip}>
                {intl.formatMessage({ id: "restore.skipAction" })}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
