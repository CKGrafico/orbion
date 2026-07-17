import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { cid, useInject } from "inversify-hooks";
import type { IInboxService, InboxBuildParams } from "../../services/interfaces";
import type { InboxItem, InboxAction, InboxQueryResult, OutageEscalation, ResolvedInboxItem } from "../../../../shared/ipc";
import type { BudgetBreach } from "../../../../shared/ipc";
import type { LoopMeta, EnvironmentHealth, Environment, Project } from "../../types";
import {
  Inbox, AlertTriangle, CheckCircle2, XCircle, WifiOff,
  Play, Pause, RotateCw, MessageSquare, X, Search, ArrowUp, ChevronRight,
  Layers,
} from "lucide-react";
import { Suspense } from "react";
import { MarkdownContent } from "../../chat/MarkdownContent";
import { timeAgo } from "../../format";

interface InboxViewProps {
  perEnvLoops: Record<string, LoopMeta[]>;
  perEnvHealth: Record<string, EnvironmentHealth>;
  environments: Environment[];
  perEnvProjects: Record<string, Project[]>;
  breaches: BudgetBreach[];
  escalatedOutages: Map<string, OutageEscalation>;
  onClickItem: (item: InboxItem) => void;
  onDismissItem: (itemId: string) => void;
  onOpenInChat: (item: InboxItem) => void;
}

interface QueryTurn {
  id: string;
  question: string;
  result: InboxQueryResult;
}

/** Map inbox item kind to icon component */
function KindIcon({ kind, notificationType }: { kind: InboxItem["kind"]; notificationType: InboxItem["notificationType"] }): React.ReactNode {
  switch (kind) {
    case "failed-loop":
      return <XCircle size={16} strokeWidth={1.8} />;
    case "finished-loop":
      return <CheckCircle2 size={16} strokeWidth={1.8} />;
    case "breach":
      return <AlertTriangle size={16} strokeWidth={1.8} />;
    case "instance-offline":
    case "prolonged-offline":
      return <WifiOff size={16} strokeWidth={1.8} />;
    case "digest":
      return <Layers size={16} strokeWidth={1.8} />;
    default:
      // Fallback based on notificationType
      switch (notificationType) {
        case "failure":
          return <XCircle size={16} strokeWidth={1.8} />;
        case "finished":
          return <CheckCircle2 size={16} strokeWidth={1.8} />;
        case "watch":
          return <AlertTriangle size={16} strokeWidth={1.8} />;
        case "digest":
          return <Layers size={16} strokeWidth={1.8} />;
      }
  }
}

/** Color class for item kind */
function kindColor(kind: InboxItem["kind"], notificationType: InboxItem["notificationType"]): string {
  switch (kind) {
    case "failed-loop":
      return "var(--danger)";
    case "finished-loop":
      return "var(--success)";
    case "breach":
      return "var(--warning)";
    case "instance-offline":
    case "prolonged-offline":
      return "var(--accent-blue)";
    case "digest":
      return "var(--accent-infra)";
    default:
      // Fallback based on notificationType
      switch (notificationType) {
        case "failure":
          return "var(--danger)";
        case "finished":
          return "var(--success)";
        case "watch":
          return "var(--warning)";
        case "digest":
          return "var(--accent-infra)";
      }
  }
}

export function InboxView({
  perEnvLoops,
  perEnvHealth,
  environments,
  perEnvProjects,
  breaches,
  escalatedOutages,
  onClickItem,
  onDismissItem,
  onOpenInChat,
}: InboxViewProps): React.ReactNode {
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
  }), [perEnvLoops, perEnvHealth, environments, breaches, dismissedIds, escalatedOutages]);

  const items = useMemo(() => inboxService.buildItems(buildParams), [inboxService, buildParams]);

  // Auto-resolution detection
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
    },
    [inboxService],
  );

  const activeItemCount = items.length;

  // Build a project lookup for source labels
  const projectLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const env of environments) {
      const envProjects = perEnvProjects[env.id] ?? [];
      for (const p of envProjects) {
        map.set(`${env.id}::${p.id}`, p.name);
      }
    }
    return map;
  }, [environments, perEnvProjects]);

  return (
    <div className="inbox-view">
      <div className="inbox-view-header">
        <div className="inbox-view-title-row">
          <Inbox size={18} />
          <h2 className="inbox-view-title">{intl.formatMessage({ id: "inbox.viewTitle" })}</h2>
          {activeItemCount > 0 && !showDone ? (
            <span className="chip inbox-view-count">{activeItemCount}</span>
          ) : null}
          <div style={{ flex: 1 }} />
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
        <p className="inbox-view-description">
          {intl.formatMessage({ id: "inbox.viewDescription" })}
        </p>
      </div>

      <div className="inbox-view-scroll" ref={scrollRef}>
        {!showDone ? (
          <>
            {/* Active items list */}
            {items.length > 0 ? (
              <div className="inbox-view-list">
                {items.map((item) => (
                  <InboxViewItemRow
                    key={item.id}
                    item={item}
                    projectLookup={projectLookup}
                    environments={environments}
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
              <div className="inbox-view-empty">
                <div className="inbox-view-empty-icon">
                  <Inbox size={32} strokeWidth={1.2} />
                </div>
                <p>{intl.formatMessage({ id: "inbox.emptyMessage" })}</p>
              </div>
            ) : null}
          </>
        ) : (
          <>
            {resolvedItems.length > 0 ? (
              <div className="inbox-view-list">
                {resolvedItems.map((ri) => (
                  <ResolvedViewItemRow
                    key={ri.item.id}
                    resolved={ri}
                  />
                ))}
              </div>
            ) : (
              <div className="inbox-view-empty">
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

/** Full inbox item row for the main panel InboxView */
function InboxViewItemRow({
  item,
  projectLookup,
  environments,
  onClick,
  onDismiss,
  onExecuteAction,
  onOpenInChat,
}: {
  item: InboxItem;
  projectLookup: Map<string, string>;
  environments: Array<{ id: string; name: string }>;
  onClick: (item: InboxItem) => void;
  onDismiss: (itemId: string) => void;
  onExecuteAction: (item: InboxItem, action: InboxAction) => Promise<void>;
  onOpenInChat: (item: InboxItem) => void;
}): React.ReactNode {
  const intl = useIntl();
  const [executingAction, setExecutingAction] = useState<InboxAction | null>(null);

  const color = kindColor(item.kind, item.notificationType);

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

  // Filter out dismiss — it has its own button position
  const inlineActions = item.availableActions.filter((a) => a !== "dismiss");

  // Resolve the source label (project on instance)
  const env = environments.find((e) => e.id === item.environmentId);
  const projectName = item.projectId
    ? projectLookup.get(`${item.environmentId}::${item.projectId}`)
    : undefined;
  const sourceLabel = projectName && env
    ? intl.formatMessage({ id: "inbox.itemSourceProject" }, { project: projectName, instance: env.name })
    : env?.name;

  const timestamp = item.occurredAt ? timeAgo(item.occurredAt) : "";

  return (
    <div
      className="inbox-view-item"
      onClick={() => onClick(item)}
      role="button"
      tabIndex={0}
    >
      <span className="inbox-view-item-icon" style={{ color }}>
        <KindIcon kind={item.kind} notificationType={item.notificationType} />
      </span>
      <div className="inbox-view-item-body">
        <span className="inbox-view-item-title">{item.title}</span>
        {item.detail ? (
          <span className="inbox-view-item-detail">{item.detail}</span>
        ) : null}
        <span className="inbox-view-item-meta">
          {sourceLabel}
          {timestamp ? ` · ${timestamp}` : ""}
        </span>
      </div>
      {inlineActions.length > 0 || item.availableActions.includes("dismiss") ? (
        <div className="inbox-view-item-actions">
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
      <span className="inbox-view-item-chevron">
        <ChevronRight size={14} />
      </span>
    </div>
  );
}

/** Resolved inbox item row for the Done view */
function ResolvedViewItemRow({
  resolved,
}: {
  resolved: ResolvedInboxItem;
}): React.ReactNode {
  const intl = useIntl();
  const { item, resolvedAt, resolution } = resolved;
  const reasonText = intl.formatMessage({ id: `inbox.resolution.${resolution}` });
  const resolvedAgo = timeAgo(resolvedAt);

  return (
    <div className="inbox-view-item inbox-view-item-resolved">
      <span className="inbox-view-item-icon inbox-view-item-icon-resolved">
        <CheckCircle2 size={16} strokeWidth={1.8} />
      </span>
      <div className="inbox-view-item-body">
        <span className="inbox-view-item-title">{item.title}</span>
        <span className="inbox-view-item-meta">
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
