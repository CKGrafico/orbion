import { useCallback, useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { cid, useInject } from "inversify-hooks";
import type { IReviewModeService } from "../../services/interfaces";
import type { ReviewModeItem, PrRiskLevel, BatchOverlapResult } from "../../../../shared/ipc";
import { GitPullRequest, CheckCircle2, AlertTriangle } from "lucide-react";

/** Color class for PR risk level chip */
function riskChipClass(riskLevel: PrRiskLevel): string {
  switch (riskLevel) {
    case "low": return "pr-risk-chip pr-risk-chip-low";
    case "medium": return "pr-risk-chip pr-risk-chip-medium";
    case "high": return "pr-risk-chip pr-risk-chip-high";
    case "uncertain": return "pr-risk-chip pr-risk-chip-uncertain";
  }
}

function prKey(repo: string, number: number): string {
  return `${repo}:${number}`;
}

export function ReviewQueueStrip(): React.ReactNode {
  const intl = useIntl();
  const [reviewModeService] = useInject<IReviewModeService>(cid.IReviewModeService);

  // Force re-renders when overlap data changes
  const [overlapVersion, setOverlapVersion] = useState(0);
  useEffect(() => {
    return reviewModeService.onOverlapUpdate(() => {
      setOverlapVersion((v) => v + 1);
    });
  }, [reviewModeService]);

  const batchItems = reviewModeService.getBatchItems();
  const activeItem = reviewModeService.getActiveItem();
  const disposedPrs = reviewModeService.getDisposedPrs();
  const overlapResult = reviewModeService.getOverlapResult();

  const handleSelect = useCallback((item: ReviewModeItem): void => {
    reviewModeService.enterBatch(batchItems, batchItems.indexOf(item));
  }, [reviewModeService, batchItems]);

  if (batchItems.length <= 1) {
    return null;
  }

  return (
    <div className="review-queue-strip" role="list" aria-label={intl.formatMessage({ id: "reviewMode.queueLabel" })}>
      <div className="review-queue-strip-header">
        <span className="review-queue-strip-title">
          {intl.formatMessage({ id: "reviewMode.queueTitle" }, { count: batchItems.length })}
        </span>
      </div>
      <div className="review-queue-strip-list">
        {batchItems.map((item) => {
          const isActive = activeItem?.repo === item.repo && activeItem?.number === item.number;
          const isDisposed = disposedPrs.has(prKey(item.repo, item.number));
          const key = prKey(item.repo, item.number);
          const overlapNotes = overlapResult?.perPrNotes.get(key);

          return (
            <button
              key={key}
              className={`review-queue-strip-row${isActive ? " review-queue-strip-row-active" : ""}${isDisposed ? " review-queue-strip-row-disposed" : ""}`}
              onClick={() => handleSelect(item)}
              role="listitem"
              aria-selected={isActive}
              aria-label={`#${item.number} ${item.title}`}
            >
              <span className="review-queue-strip-row-icon">
                {isDisposed ? (
                  <CheckCircle2 size={14} strokeWidth={1.8} />
                ) : (
                  <GitPullRequest size={14} strokeWidth={1.8} />
                )}
              </span>
              <div className="review-queue-strip-row-body">
                <span className="review-queue-strip-row-identity">
                  <span className="review-queue-strip-row-number">#{item.number}</span>
                  <span className="review-queue-strip-row-title">{item.title}</span>
                </span>
                {item.verdict ? (
                  <span className="review-queue-strip-row-verdict">
                    <span className={riskChipClass(item.verdict.riskLevel)}>
                      {intl.formatMessage({ id: `inbox.prRisk.${item.verdict.riskLevel}` })}
                    </span>
                    <span className="review-queue-strip-row-verdict-text">
                      {item.verdict.verdict}
                    </span>
                  </span>
                ) : (
                  <span className="review-queue-strip-row-verdict">
                    <span className="pr-risk-chip pr-risk-chip-pending">
                      {intl.formatMessage({ id: "inbox.prVerdict.analyzing" })}
                    </span>
                  </span>
                )}
                {overlapNotes && overlapNotes.length > 0 && (
                  <span className="review-queue-strip-row-overlap">
                    <AlertTriangle size={11} className="review-queue-strip-row-overlap-icon" />
                    <span className="review-queue-strip-row-overlap-text">
                      {overlapNotes.join(" · ")}
                    </span>
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
