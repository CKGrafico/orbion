import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { cid, useInject } from "inversify-hooks";
import type { IInboxService, InboxBuildParams } from "../../services/interfaces";
import type { InboxItem, InboxQueryResult, OutageEscalation } from "../../../../shared/ipc";
import type { BudgetBreach } from "../../../../shared/ipc";
import type { LoopMeta, EnvironmentHealth, Environment } from "../../types";
import { ArrowUp, Inbox, X, Search } from "lucide-react";
import { Suspense } from "react";
import { MarkdownContent } from "../../chat/MarkdownContent";

interface InboxPanelProps {
  perEnvLoops: Record<string, LoopMeta[]>;
  perEnvHealth: Record<string, EnvironmentHealth>;
  environments: Environment[];
  breaches: BudgetBreach[];
  escalatedOutages: Map<string, OutageEscalation>;
  onClickItem: (item: InboxItem) => void;
  onDismissItem: (itemId: string) => void;
}

interface QueryTurn {
  id: string;
  question: string;
  result: InboxQueryResult;
}

export function InboxPanel({
  perEnvLoops,
  perEnvHealth,
  environments,
  breaches,
  escalatedOutages,
  onClickItem,
  onDismissItem,
}: InboxPanelProps): React.ReactNode {
  const intl = useIntl();
  const [inboxService] = useInject<IInboxService>(cid.IInboxService);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [queryText, setQueryText] = useState("");
  const [queryTurns, setQueryTurns] = useState<QueryTurn[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);
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

  // Build inbox items from live data
  const buildParams = useMemo<InboxBuildParams>(() => ({
    perEnvLoops,
    perEnvHealth,
    environments,
    breaches,
    dismissedIds,
    escalatedOutages,
  }), [perEnvLoops, perEnvHealth, environments, breaches, dismissedIds, escalatedOutages]);

  const items = useMemo(() => inboxService.buildItems(buildParams), [inboxService, buildParams]);

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

  const activeItemCount = items.length;

  return (
    <div className="inbox-panel">
      <div className="inbox-header">
        <Inbox size={14} />
        <span className="overline">{intl.formatMessage({ id: "inbox.title" })}</span>
        {activeItemCount > 0 ? (
          <span className="chip inbox-count">{activeItemCount}</span>
        ) : null}
      </div>

      {/* Query conversation area */}
      <div className="inbox-scroll" ref={scrollRef}>
        {/* Active items list */}
        {items.length > 0 && queryTurns.length === 0 ? (
          <div className="inbox-items-list">
            {items.map((item) => (
              <InboxItemRow
                key={item.id}
                item={item}
                onClick={onClickItem}
                onDismiss={handleDismiss}
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
}: {
  item: InboxItem;
  onClick: (item: InboxItem) => void;
  onDismiss: (itemId: string) => void;
}): React.ReactNode {
  const kindIcon = item.kind === "breach" ? "!" : item.kind === "failed-loop" ? "x" : item.kind === "instance-offline" ? "-" : item.kind === "prolonged-offline" ? "⏻" : "?";
  const kindClass = item.kind === "breach" || item.kind === "failed-loop"
    ? "inbox-item-dot-danger"
    : item.kind === "prolonged-offline"
    ? "inbox-item-dot-warning"
    : item.kind === "instance-offline"
    ? "inbox-item-dot-info"
    : "inbox-item-dot-info";

  return (
    <div
      className="inbox-item-row"
      onClick={() => onClick(item)}
      role="button"
      tabIndex={0}
    >
      <span className={`inbox-item-dot ${kindClass}`}>{kindIcon}</span>
      <div className="inbox-item-info">
        <span className="inbox-item-title">{item.title}</span>
        <span className="inbox-item-meta">
          {item.environmentName}
          {item.detail ? ` · ${item.detail}` : ""}
        </span>
      </div>
      <button
        className="icon-btn inbox-item-dismiss"
        title="Dismiss"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(item.id);
        }}
      >
        <X size={11} />
      </button>
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
