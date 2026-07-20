import { useCallback, useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { cid, useInject } from "inversify-hooks";
import type { IReviewModeService } from "../../services/interfaces";
import type { ReviewModeItem, PrRiskLevel } from "../../../../shared/ipc";
import { GitPullRequest, X, ExternalLink } from "lucide-react";
import { ReviewQueueStrip } from "./ReviewQueueStrip";
import { ReviewDiffView } from "./ReviewDiffView";
import { ReviewBriefingView } from "./ReviewBriefingView";

/** Color class for PR risk level chip (shared with InboxView) */
function riskChipClass(riskLevel: PrRiskLevel): string {
  switch (riskLevel) {
    case "low": return "pr-risk-chip pr-risk-chip-low";
    case "medium": return "pr-risk-chip pr-risk-chip-medium";
    case "high": return "pr-risk-chip pr-risk-chip-high";
    case "uncertain": return "pr-risk-chip pr-risk-chip-uncertain";
  }
}

type ReviewTab = "briefing" | "raw-diff";

export function ReviewModeOverlay(): React.ReactNode {
  const [reviewModeService] = useInject<IReviewModeService>(cid.IReviewModeService);

  const activeItem = reviewModeService.getActiveItem();

  const handleExit = useCallback(() => {
    reviewModeService.exit();
  }, [reviewModeService]);

  // Esc key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        reviewModeService.exit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [reviewModeService]);

  if (!activeItem) return null;

  return (
    <ReviewModeContent item={activeItem} onExit={handleExit} />
  );
}

function ReviewModeContent({
  item,
  onExit,
}: {
  item: ReviewModeItem;
  onExit: () => void;
}): React.ReactNode {
  const intl = useIntl();
  const [activeTab, setActiveTab] = useState<ReviewTab>("briefing");

  return (
    <div className="review-mode-overlay" role="dialog" aria-label={intl.formatMessage({ id: "reviewMode.dialogLabel" })}>
      <div className="review-mode-container">
        {/* Header */}
        <div className="review-mode-header">
          <div className="review-mode-header-left">
            <span className="review-mode-icon">
              <GitPullRequest size={18} strokeWidth={1.8} />
            </span>
            <div className="review-mode-identity">
              <span className="review-mode-repo">{item.repo}</span>
              <span className="review-mode-number">#{item.number}</span>
              <span className="review-mode-title">{item.title}</span>
            </div>
            <span className="review-mode-author">
              {intl.formatMessage({ id: "reviewMode.byAuthor" }, { author: item.author })}
            </span>
            {item.verdict ? (
              <span className={riskChipClass(item.verdict.riskLevel)}>
                {intl.formatMessage({ id: `inbox.prRisk.${item.verdict.riskLevel}` })}
              </span>
            ) : (
              <span className="pr-risk-chip pr-risk-chip-pending">
                {intl.formatMessage({ id: "inbox.prVerdict.analyzing" })}
              </span>
            )}
          </div>
          <div className="review-mode-header-right">
            <div className="review-mode-actions">
              {/* Tab toggle pill */}
              <div className="review-mode-tab-toggle">
                <button
                  className={`review-mode-tab-btn${activeTab === "briefing" ? " review-mode-tab-btn-active" : ""}`}
                  onClick={() => setActiveTab("briefing")}
                >
                  {intl.formatMessage({ id: "reviewMode.briefing.tabLabel" })}
                </button>
                <button
                  className={`review-mode-tab-btn${activeTab === "raw-diff" ? " review-mode-tab-btn-active" : ""}`}
                  onClick={() => setActiveTab("raw-diff")}
                >
                  {intl.formatMessage({ id: "reviewMode.briefing.rawDiffTab" })}
                </button>
              </div>
              <button
                className="review-mode-action-btn review-mode-action-open"
                title={intl.formatMessage({ id: "reviewMode.openOnPlatform" })}
                onClick={() => { window.open(item.url, "_blank"); }}
              >
                <ExternalLink size={12} />
                <span>{intl.formatMessage({ id: "reviewMode.openOnPlatform" })}</span>
              </button>
            </div>
            <button
              className="icon-btn review-mode-close"
              title={intl.formatMessage({ id: "reviewMode.close" })}
              onClick={onExit}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body: two-column layout with queue strip */}
        <div className="review-mode-body">
          <ReviewQueueStrip />
          <div className="review-mode-main-area">
            {activeTab === "briefing" ? <ReviewBriefingView /> : <ReviewDiffView />}
          </div>
        </div>
      </div>
    </div>
  );
}
