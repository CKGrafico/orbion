import { useCallback, useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { cid, useInject } from "inversify-hooks";
import type { IReviewModeService } from "../../services/interfaces";
import type { ReviewModeItem, PrRiskLevel, BatchOverlapResult } from "../../../../shared/ipc";
import { GitPullRequest, X, ExternalLink, CheckCircle2, MessageCircleWarning, Loader2, AlertTriangle } from "lucide-react";
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
  const [reviewModeService] = useInject<IReviewModeService>(cid.IReviewModeService);
  const [activeTab, setActiveTab] = useState<ReviewTab>("briefing");
  const [submitting, setSubmitting] = useState<"APPROVE" | "REQUEST_CHANGES" | null>(null);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [overlapVersion, setOverlapVersion] = useState(0);

  // Subscribe to overlap updates to trigger re-renders
  useEffect(() => {
    return reviewModeService.onOverlapUpdate(() => {
      setOverlapVersion((v) => v + 1);
    });
  }, [reviewModeService]);

  const disposedPrs = reviewModeService.getDisposedPrs();
  const isDisposed = disposedPrs.has(`${item.repo}:${item.number}`);

  const handleApprove = useCallback(async () => {
    if (submitting) return;
    setSubmitting("APPROVE");
    setSubmitError(null);

    const result = await reviewModeService.submitReview({
      repo: item.repo,
      number: item.number,
      event: "APPROVE",
    });

    if (!result.ok) {
      setSubmitError(result.error ?? "Failed to approve");
    }
    setSubmitting(null);
  }, [submitting, reviewModeService, item.repo, item.number]);

  const handleRequestChanges = useCallback(async () => {
    if (submitting) return;
    setSubmitting("REQUEST_CHANGES");
    setSubmitError(null);

    const result = await reviewModeService.submitReview({
      repo: item.repo,
      number: item.number,
      event: "REQUEST_CHANGES",
      body: commentText.trim() || undefined,
    });

    if (!result.ok) {
      setSubmitError(result.error ?? "Failed to request changes");
    } else {
      setShowCommentInput(false);
      setCommentText("");
    }
    setSubmitting(null);
  }, [submitting, reviewModeService, item.repo, item.number, commentText]);

  const handleOpenOnWeb = useCallback(() => {
    reviewModeService.openOnWeb(item.url);
  }, [reviewModeService, item.url]);

  const toggleCommentInput = useCallback(() => {
    setShowCommentInput((prev) => !prev);
    setSubmitError(null);
  }, []);

  const overlapResult = reviewModeService.getOverlapResult();
  const hasOverlaps = overlapResult && overlapResult.overlaps.length > 0;
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Reset banner when batch changes
  useEffect(() => {
    setBannerDismissed(false);
  }, [item.repo, item.number]);

  const batchItems = reviewModeService.getBatchItems();

  const handleOrderClick = useCallback((prKey: string) => {
    const match = batchItems.find((bi) => `${bi.repo}:${bi.number}` === prKey);
    if (match) {
      reviewModeService.enterBatch(batchItems, batchItems.indexOf(match));
    }
  }, [batchItems, reviewModeService]);

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
            {isDisposed && (
              <span className="review-mode-disposed-badge">
                <CheckCircle2 size={12} />
                {intl.formatMessage({ id: "reviewMode.disposed" })}
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

              {/* Review action buttons (hidden when already disposed) */}
              {!isDisposed && (
                <>
                  <button
                    className="review-mode-action-btn review-mode-action-approve"
                    title={intl.formatMessage({ id: "reviewMode.approve" })}
                    onClick={handleApprove}
                    disabled={submitting !== null}
                  >
                    {submitting === "APPROVE" ? (
                      <Loader2 size={12} className="spin" />
                    ) : (
                      <CheckCircle2 size={12} />
                    )}
                    <span>{intl.formatMessage({ id: "reviewMode.approve" })}</span>
                  </button>
                  <button
                    className="review-mode-action-btn review-mode-action-request-changes"
                    title={intl.formatMessage({ id: "reviewMode.requestChanges" })}
                    onClick={toggleCommentInput}
                    disabled={submitting !== null}
                  >
                    <MessageCircleWarning size={12} />
                    <span>{intl.formatMessage({ id: "reviewMode.requestChanges" })}</span>
                  </button>
                </>
              )}

              <button
                className="review-mode-action-btn review-mode-action-open"
                title={intl.formatMessage({ id: "reviewMode.openOnWeb" })}
                onClick={handleOpenOnWeb}
              >
                <ExternalLink size={12} />
                <span>{intl.formatMessage({ id: "reviewMode.openOnWeb" })}</span>
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

        {/* Comment input for request-changes */}
        {showCommentInput && !isDisposed && (
          <div className="review-mode-comment-bar">
            <textarea
              className="review-mode-comment-input"
              placeholder={intl.formatMessage({ id: "reviewMode.commentPlaceholder" })}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              rows={2}
              autoFocus
            />
            <div className="review-mode-comment-actions">
              <button
                className="review-mode-comment-submit"
                onClick={handleRequestChanges}
                disabled={submitting !== null}
              >
                {submitting === "REQUEST_CHANGES" ? (
                  <Loader2 size={14} className="spin" />
                ) : null}
                {intl.formatMessage({ id: "reviewMode.submitRequestChanges" })}
              </button>
              <button
                className="review-mode-comment-cancel"
                onClick={() => { setShowCommentInput(false); setCommentText(""); setSubmitError(null); }}
                disabled={submitting !== null}
              >
                {intl.formatMessage({ id: "reviewMode.cancelComment" })}
              </button>
            </div>
          </div>
        )}

        {/* Submit error */}
        {submitError && (
          <div className="review-mode-submit-error">
            {submitError}
          </div>
        )}

        {/* Overlap review order banner */}
        {hasOverlaps && !bannerDismissed && (
          <div className="review-order-banner">
            <AlertTriangle size={14} className="review-order-banner-icon" />
            <span className="review-order-banner-text">
              {intl.formatMessage(
                { id: "reviewMode.overlap.bannerTitle" },
                { count: overlapResult.overlaps.length },
              )}
              {" — "}
              {overlapResult.suggestedOrder.map((entry, idx) => (
                <span key={entry.prKey}>
                  {idx > 0 && <span className="review-order-banner-arrow"> → </span>}
                  <button
                    className="review-order-banner-pr-link"
                    onClick={() => handleOrderClick(entry.prKey)}
                  >
                    #{entry.number}
                  </button>
                </span>
              ))}
            </span>
            <button
              className="review-order-banner-dismiss"
              onClick={() => setBannerDismissed(true)}
              aria-label={intl.formatMessage({ id: "reviewMode.overlap.dismissBanner" })}
            >
              <X size={12} />
            </button>
          </div>
        )}

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
