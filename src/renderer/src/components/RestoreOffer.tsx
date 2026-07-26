import { useState } from "react";
import { useTranslation } from "react-i18next";
import { translateMessage } from "../i18n";
import type { RestoreAvailability, PullRestoreResult } from "../../../shared/ipc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Restore-offer dialog: shown when a config-home VM has a config file
 * available for pull-canonical restore.
 */
export function RestoreOffer({
  availability,
  onRestore,
  onSkip,
  open = true,
  onOpenChange,
}: {
  availability: RestoreAvailability & { available: true };
  onRestore: () => Promise<PullRestoreResult>;
  onSkip: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}): React.ReactNode {
  const { t } = useTranslation();
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRestore(): Promise<void> {
    setRestoring(true);
    setError(null);
    const result = await onRestore();
    if (!result.ok) {
      setRestoring(false);
      setError(translateMessage(result.error) ?? t("restore.restoreFailed", { error: "Unknown error" }));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("restore.availableTitle")}</DialogTitle>
          <DialogDescription>
            {t(
              "restore.availableCopy",
              {
                count: availability.environmentCount,
                names: availability.environmentNames.join(", "),
              },
            )}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="restore-offer-error">{error}</p>
        )}
        <DialogFooter>
          {restoring ? (
            <span className="restore-offer-progress">
              {t("restore.restoringTitle")}
            </span>
          ) : (
            <>
              <Button onClick={() => void handleRestore()}>
                {t("restore.restoreAction")}
              </Button>
              <Button variant="outline" onClick={onSkip}>
                {t("restore.skipAction")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
