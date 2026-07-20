import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { cid, useInject } from "inversify-hooks";
import type { IInboxService, InboxBuildParams } from "../../services/interfaces";
import type { InboxItem, InboxAction, InboxQueryResult, OutageEscalation, ResolvedInboxItem, PrAwaitingReviewItem, PrVerdict, PrRiskLevel } from "../../../../shared/ipc";
import type { BudgetBreach } from "../../../../shared/ipc";
import type { LoopMeta, EnvironmentHealth, Environment } from "../../types";
import { ArrowUp, CheckCircle2, Inbox, X, Search, Play, Pause, RotateCw, MessageSquare } from "lucide-react";
import { Suspense } from "react";
import { MarkdownContent } from "../../chat/MarkdownContent";
import { timeAgo } from "../../format";

interface InboxPanelProps {
  perEnvLoops: Record<string, LoopMeta[]>;
  perEnvHealth: Record<string, EnvironmentHealth>;
  environments: Environment[];
  breaches: BudgetBreach[];
  escalatedOutages: Map<string, OutageEscalation>;
  prAwaitingReview: PrAwaitingReviewItem[];
  mainVmEnvironmentId: string | null;
  mainVmEnvironmentName: string;
  prVerdicts: Map<string, PrVerdict>;
  onClickItem: (item: InboxItem) => void;
  onDismissItem: (itemId: string) => void;
  /** Called when the user triggers "Open in chat" on an inbox item. */
  onOpenInChat: (item: InboxItem) => void;
}

interface QueryTurn {
  id: string;
  question: string;
  result: InboxQueryResult;
}

/** Color class for PR risk level chip */
function riskChipClass(riskLevel: PrRiskLevel): string {
  switch (riskLevel) {
    case "low": return "pr-risk-chip pr-risk-chip-low";
    case "medium": return "pr-risk-chip pr-risk-chip-medium";
    case "high": return "pr-risk-chip pr-risk-chip-high";
    case "uncertain": return "pr-risk-chip pr-risk-chip-uncertain";
  }
}

/** Render the verdict and risk chip for a PR inbox item */
function PrVerdictDisplayPanel({ verdict }: { verdict?: PrVerdict }): React.ReactNode {
  const intl = useIntl();

  if (!verdict) {
    return (
      <span className="inbox-item-verdict">
        <span className="pr-risk-chip pr-risk-chip-pending">
          {intl.formatMessage({ id: "inbox.prVerdict.analyzing" })}
        </span>
      </span>
    );
  }

  return (
    <span className="inbox-item-verdict">
      <span className={riskChipClass(verdict.riskLevel)}>
        {intl.formatMessage({ id: `inbox.prRisk.${verdict.riskLevel}` })}
      </span>
      <span className="inbox-item-verdict-text">{verdict.verdict}</span>
    </span>
  );
}

export function InboxPanel({
  perEnvLoops,
  perEnvHealth,
  environments,
  breaches,
  escalatedOutages,
  prAwaitingReview,
  mainVmEnvironmentId,
  mainVmEnvironmentName,
  prVerdicts,
  onClickItem,
  onDismissItem,
  onOpenInChat,
}: InboxPanelProps): React.ReactNode {
  const intl = useIntl();
  const [inboxService] = useInject<IInboxService>(cid.IInboxService);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [queryText, setQueryText] = useState("");
  const [queryTurns, setQueryTurns] = useState<QueryTurn[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [resolvedItems, setResolvedItems] = useState<ResolvedInboxItem[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load dismissed IDs on mount
  useEffect(() => {
    let cancelled = false;
    void inboxService.getDismissedIds().then((ids) => {
      if (cancelled) return;
      setDismissedIds(new Set(ids));
    });
    return () => { cancelled = true; };
  }, [inboxService]);

  // Load resolved items when Done tab is active
  useEffect(() => {
    if (!showDone) return;
    let cancelled = false;
    void inboxService.getResolvedItems().then((items) => {
      if (cancelled) return;
      setResolvedItems(items);
    });
    return () => { cancelled = true; };
  }, [inboxService, showDone]);

  // Build inbox items from live data
  const buildParams = useMemo<InboxBuildParams>(() => ({
    perEnvLoops,
    perEnvHealth,
    environments,
    breaches,
    dismissedIds,
    escalatedOutages,
    prAwaitingReview,
    mainVmEnvironmentId,
    mainVmEnvironmentName,
    prVerdicts,
  }), [perEnvLoops, perEnvHealth, environments, breaches, dismissedIds, escalatedOutages, prAwaitingReview, mainVmEnvironmentId, mainVmEnvironmentName, prVerdicts]);

  const items = useMemo(() => inboxService.buildItems(buildParams), [inboxService, buildParams]);

  // Auto-resolution detection: diff previous and current active items
  const prevItemsRef = useRef<InboxItem[]>([]);
  useEffect(() => {
    const prevItems = prevItemsRef.current;
    const currentIds = new Set(items.map((i) => i.id));
    const autoResolved = inboxService.detectAutoResolutions(prevItems, currentIds, dismissedIds);

    if (autoResolved.length > 0) {
      for (const resolved of autoResolved) {
        void inboxService.resolveItem(resolved);
      }
    }

    prevItemsRef.current = items;
  }, [items, inboxService, dismissedIds]);

  // Handle submitting a query
  const handleSubmitQuery = useCallback(() => {
    const text = queryText.trim();
    if (!text || isQuerying) return;

    setIsQuerying(true);
    const result = inboxService.queryFleet(text, buildParams);

    const turn: QueryTurn = {
      id: `inbox-q-${Date.now()}`,
      question: text,
      result,
    };

    setQueryTurns((prev) => [...prev, turn]);
    setQueryText("");
    setIsQuerying(false);

    // Scroll to bottom
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }, [queryText, isQuerying, inboxService, buildParams]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmitQuery();
      }
    },
    [handleSubmitQuery],
  );

  const handleDismiss = useCallback(
    (itemId: string) => {
      setDismissedIds((prev) => new Set([...prev, itemId]));
      void inboxService.dismissItem(itemId);
      onDismissItem(itemId);
    },
    [inboxService, onDismissItem],
  );

  const handleExecuteAction = useCallback(
    async (item: InboxItem, action: InboxAction) => {
      const result = await inboxService.executeInboxAction(item, action);
      if (action === "dismiss" && result.ok) {
        setDismissedIds((prev) => new Set([...prev, item.id]));
      }
      // Action results are reflected on next poll cycle (5s) per existing architecture
    },
    [inboxService],
  );

  const activeItemCount = items.length;

  return (
    <div className="inbox-panel">
      <div className="inbox-header">
        <Inbox size={14} />
        <span className="overline">{intl.formatMessage({ id: "inbox.title" })}</span>
        {activeItemCount > 0 && !showDone ? (
          <span className="chip inbox-count">{activeItemCount}</span>
        ) : null}
        <div className="inbox-tabs">
          <button
            className={`inbox-tab ${!showDone ? "inbox-tab-active" : ""}`}
            onClick={() => setShowDone(false)}
          >
            {intl.formatMessage({ id: "inbox.tabActive" })}
          </button>
          <button
            className={`inbox-tab ${showDone ? "inbox-tab-active" : ""}`}
            onClick={() => setShowDone(true)}
          >
            {intl.formatMessage({ id: "inbox.tabDone" })}
          </button>
        </div>
      </div>

      {/* Query conversation area */}
      <div className="inbox-scroll" ref={scrollRef}>
        {!showDone ? (
          <>
            {/* Active items list */}
            {items.length > 0 && queryTurns.length === 0 ? (
              <div className="inbox-items-list">
                {items.map((item) => (
                  <InboxItemRow
                    key={item.id}
                    item={item}
                    onClick={onClickItem}
                    onDismiss={handleDismiss}
                    onExecuteAction={handleExecuteAction}
                    onOpenInChat={onOpenInChat}
                  />
                ))}
              </div>
            ) : null}

            {/* Query turns */}
            {queryTurns.map((turn) => (
              <div key={turn.id} className="inbox-query-turn">
                <div className="inbox-query-question">
                  <span className="inbox-query-icon">?</span>
                  <span>{turn.question}</span>
                </div>
                <div className="inbox-query-answer">
                  <InboxAnswerContent
                    answer={turn.result.answer}
                    references={turn.result.references}
                    onClickReference={onClickItem}
                  />
                </div>
              </div>
            ))}

            {items.length === 0 && queryTurns.length === 0 ? (
              <div className="inbox-empty">
                <p>{intl.formatMessage({ id: "inbox.emptyMessage" })}</p>
              </div>
            ) : null}
          </>
        ) : (
          <>
            {/* Done / Resolved items list */}
            {resolvedItems.length > 0 ? (
              <div className="inbox-items-list">
                {resolvedItems.map((ri) => (
                  <ResolvedItemRow
                    key={ri.item.id}
                    resolved={ri}
                    intl={intl}
                  />
                ))}
              </div>
            ) : (
              <div className="inbox-empty">
                <p>{intl.formatMessage({ id: "inbox.doneEmptyMessage" })}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Composer */}
      <div className="inbox-composer">
        <div className="inbox-composer-row">
          <Search size={13} className="inbox-composer-icon" />
          <textarea
            className="inbox-composer-input"
            placeholder={intl.formatMessage({ id: "inbox.queryPlaceholder" })}
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isQuerying}
            rows={1}
          />
          <button
            className="inbox-composer-send"
            title={intl.formatMessage({ id: "inbox.sendQuery" })}
            onClick={handleSubmitQuery}
            disabled={!queryText.trim() || isQuerying}
          >
            <ArrowUp size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Single inbox item row */
function InboxItemRow({
  item,
  onClick,
  onDismiss,
  onExecuteAction,
  onOpenInChat,
}: {
  item: InboxItem;
  onClick: (item: InboxItem) => void;
  onDismiss: (itemId: string) => void;
  onExecuteAction: (item: InboxItem, action: InboxAction) => Promise<void>;
  onOpenInChat: (item: InboxItem) => void;
}): React.ReactNode {
  const intl = useIntl();
  const [executingAction, setExecutingAction] = useState<InboxAction | null>(null);

  const typeIcon = item.notificationType === "failure" ? "!" : item.notificationType === "finished" ? "✓" : item.notificationType === "watch" ? "!" : item.notificationType === "digest" ? "≡" : "?";
  const typeClass = item.notificationType === "failure"
    ? "inbox-item-dot-danger"
    : item.notificationType === "finished"
    ? "inbox-item-dot-success"
    : item.notificationType === "watch"
    ? "inbox-item-dot-warning"
    : item.notificationType === "digest"
    ? "inbox-item-dot-info"
    : "inbox-item-dot-info";

  const handleAction = useCallback(async (action: InboxAction, e: React.MouseEvent) => {
    e.stopPropagation();
    if (executingAction) return;

    if (action === "open-in-chat") {
      onOpenInChat(item);
      return;
    }

    setExecutingAction(action);
    try {
      await onExecuteAction(item, action);
    } finally {
      setExecutingAction(null);
    }
  }, [executingAction, item, onExecuteAction, onOpenInChat]);

  const actionIcon = (action: InboxAction): React.ReactNode => {
    switch (action) {
      case "run-now": return <Play size={10} />;
      case "pause": return <Pause size={10} />;
      case "resume": return <Play size={10} />;
      case "restart": return <RotateCw size={10} />;
      case "dismiss": return <X size={10} />;
      case "open-in-chat": return <MessageSquare size={10} />;
    }
  };

  const actionLabel = (action: InboxAction): string => {
    return intl.formatMessage({ id: `inbox.action.${action}` });
  };

  // Filter out dismiss — it already has its own button position
  const inlineActions = item.availableActions.filter((a) => a !== "dismiss");

  return (
    <div
      className="inbox-item-row"
      onClick={() => onClick(item)}
      role="button"
      tabIndex={0}
    >
      <span className={`inbox-item-dot ${typeClass}`}>{typeIcon}</span>
      <div className="inbox-item-info">
        <span className="inbox-item-title">{item.title}</span>
        {item.kind === "pr-awaiting-review" ? (
          <PrVerdictDisplayPanel verdict={item.prVerdict} />
        ) : null}
        <span className="inbox-item-meta">
          {item.environmentName}
          {item.detail ? ` · ${item.detail}` : ""}
        </span>
      </div>
      {/* Inline action buttons */}
      {inlineActions.length > 0 || item.availableActions.includes("dismiss") ? (
        <div className="inbox-item-actions">
          {inlineActions.map((action) => (
            <button
              key={action}
              className={`inbox-action-btn ${executingAction === action ? "inbox-action-btn-loading" : ""}`}
              title={actionLabel(action)}
              onClick={(e) => handleAction(action, e)}
              disabled={executingAction !== null}
            >
              {executingAction === action ? (
                <span className="inbox-action-spinner" />
              ) : (
                actionIcon(action)
              )}
              <span className="inbox-action-label">{actionLabel(action)}</span>
            </button>
          ))}
          {item.availableActions.includes("dismiss") ? (
            <button
              className="icon-btn inbox-item-dismiss"
              title={intl.formatMessage({ id: "inbox.action.dismiss" })}
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(item.id);
              }}
              disabled={executingAction !== null}
            >
              <X size={11} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Resolved inbox item row for the Done view */
function ResolvedItemRow({
  resolved,
  intl,
}: {
  resolved: ResolvedInboxItem;
  intl: ReturnType<typeof useIntl>;
}): React.ReactNode {
  const { item, resolvedAt, resolution } = resolved;
  const reasonText = intl.formatMessage({ id: `inbox.resolution.${resolution}` });
  const resolvedAgo = timeAgo(resolvedAt);

  return (
    <div className="inbox-item-row inbox-item-row-resolved">
      <span className="inbox-item-dot inbox-item-dot-resolved">
        <CheckCircle2 size={11} />
      </span>
      <div className="inbox-item-info">
        <span className="inbox-item-title">{item.title}</span>
        <span className="inbox-item-meta">
          {item.environmentName}
          {item.detail ? ` · ${item.detail}` : ""}
          {" · "}{reasonText} · {resolvedAgo}
        </span>
      </div>
    </div>
  );
}

/** Renders the markdown answer with clickable inbox:// links */
function InboxAnswerContent({
  answer,
  references,
  onClickReference,
}: {
  answer: string;
  references: InboxItem[];
  onClickReference: (item: InboxItem) => void;
}): React.ReactNode {
  // Intercept clicks on inbox:// links
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleClick = (e: MouseEvent): void => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (!href.startsWith("inbox://")) return;

      e.preventDefault();
      const itemId = href.slice("inbox://".length);
      const ref = references.find((r) => r.id === itemId);
      if (ref) onClickReference(ref);
    };

    el.addEventListener("click", handleClick);
    return () => el.removeEventListener("click", handleClick);
  }, [references, onClickReference]);

  return (
    <div ref={containerRef} className="inbox-answer-content">
      <Suspense fallback={null}>
        <MarkdownContent content={answer} />
      </Suspense>
    </div>
  );
}
