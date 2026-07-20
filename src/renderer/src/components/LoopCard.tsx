import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";
import type { Environment, LoopMeta, LoopStatus, TaskDefinition } from "../types";
import { STATUS_COLORS, commandLine, timeUntil } from "../format";
import { fetchLogs, fetchTasks, pauseLoop, resumeLoop, stopLoop, subscribeLogs, triggerLoop } from "../api";
import { classifyLogLine } from "./log-types";
import { useNextRunCountdown } from "./useNextRunCountdown";
import type { StreamState } from "./useLiveLog";
import { resolveTaskChain, TaskChainView } from "./TaskChainView";

interface LoopCardProps {
  /** The loop to display. Updated live from the loop store. */
  loop: LoopMeta;
  /** Whether the instance hosting this loop is reachable. */
  reachability?: "connected" | "reconnecting" | "unreachable";
  /** The environment-instance that hosts this loop. When provided, the card shows a log tail and action buttons. */
  instance?: Environment;
  /** The scroll container element for IntersectionObserver rooting (enables auto-collapse when scrolled past). */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  /** Monotonically increasing version counter. When incremented, the task chain cache is invalidated. */
  chainVersion?: number;
}

/** Pulse animation for running status dots. */
const PULSING_STATUSES: Set<LoopStatus> = new Set(["running"]);

/** Number of tail lines to fetch initially. */
const LOG_TAIL_SIZE = 10;

/** Maximum in-memory lines for the compact card log view. */
const MAX_LOG_LINES = 50;

/** How long the action result message stays visible (ms). */
const RESULT_DISPLAY_MS = 2000;

/** How long an error message stays visible (ms). */
const ERROR_DISPLAY_MS = 4000;

/** Loop action type for internal state tracking. */
type LoopAction = "pause" | "resume" | "stop" | "trigger";

/** Result of executing a loop action. */
type ActionResult =
  | { kind: "success"; action: LoopAction }
  | { kind: "error"; message: string };

/**
 * Determine which actions are available for a given loop status.
 * Rules per the spec:
 *   running  → Pause, Stop
 *   waiting  → Pause, Stop, Run Now
 *   paused   → Resume, Stop, Run Now
 *   stopped  → Run Now
 *   failed   → Stop, Run Now
 *   finished → (none)
 */
function getAvailableActions(status: LoopStatus): LoopAction[] {
  switch (status) {
    case "running":
      return ["pause", "stop"];
    case "waiting":
      return ["pause", "stop", "trigger"];
    case "paused":
      return ["resume", "stop", "trigger"];
    case "stopped":
      return ["trigger"];
    case "failed":
      return ["stop", "trigger"];
    case "finished":
      return [];
  }
}

/**
 * Determine which actions need confirmation before executing.
 * Stop always needs confirmation (clears schedule).
 * Pause of a running loop needs confirmation (interrupts active work).
 * Run Now on a stopped loop needs confirmation (re-schedules).
 * Resume and Run Now on a waiting loop execute immediately.
 */
function needsConfirmation(action: LoopAction, status: LoopStatus): boolean {
  if (action === "stop") return true;
  if (action === "pause" && status === "running") return true;
  if (action === "trigger" && status === "stopped") return true;
  return false;
}

/** Result label for a successful action. */
function actionResultLabel(action: LoopAction): string {
  switch (action) {
    case "pause": return "loopCard.resultPaused";
    case "resume": return "loopCard.resultResumed";
    case "stop": return "loopCard.resultStopped";
    case "trigger": return "loopCard.resultTriggered";
  }
}

/** Button label for an action. */
function actionButtonLabel(action: LoopAction): string {
  switch (action) {
    case "pause": return "loopCard.actionPause";
    case "resume": return "loopCard.actionResume";
    case "stop": return "loopCard.actionStop";
    case "trigger": return "loopCard.actionRunNow";
  }
}

/** Confirmation title i18n key for an action that needs confirmation. */
function confirmTitleKey(action: LoopAction): string {
  switch (action) {
    case "pause": return "loopCard.confirmPauseTitle";
    case "stop": return "loopCard.confirmStopTitle";
    case "trigger": return "loopCard.confirmRunNowTitle";
    default: return "loopCard.confirmRunNowTitle";
  }
}

/** Confirmation description i18n key for an action that needs confirmation. */
function confirmDescriptionKey(action: LoopAction): string {
  switch (action) {
    case "pause": return "loopCard.confirmPauseDescription";
    case "stop": return "loopCard.confirmStopDescription";
    case "trigger": return "loopCard.confirmRunNowDescription";
    default: return "loopCard.confirmRunNowDescription";
  }
}

export function LoopCard({ loop, reachability, instance, scrollContainerRef, chainVersion }: LoopCardProps): React.ReactNode {
  const intl = useIntl();

  const isReachable = reachability === "connected" || reachability === undefined;
  const failed = loop.lastExitCode !== null && loop.lastExitCode !== 0;
  const isRunning = loop.status === "running";
  const isPulsing = PULSING_STATUSES.has(loop.status);

  // Derive display name: description > command > id
  const name = loop.description?.trim() || commandLine(loop.command, loop.commandArgs) || loop.id;

  // Next-run countdown
  const countdown = useNextRunCountdown(loop.nextRunAt);
  const nextRunLabel = isReachable
    ? (countdown ?? (loop.nextRunAt ? timeUntil(loop.nextRunAt) : intl.formatMessage({ id: "loopCard.noNextRun" })))
    : intl.formatMessage({ id: "loopCard.unknown" });

  // Exit code display
  const exitCodeLabel = loop.lastExitCode === null
    ? "-"
    : String(loop.lastExitCode);

  // Run count display
  const runCountLabel = loop.maxRuns
    ? `${loop.runCount}/${loop.maxRuns}`
    : String(loop.runCount);

  // Status dot color
  const dotColor = isReachable
    ? (STATUS_COLORS[loop.status] ?? "var(--text-secondary)")
    : "var(--status-unknown)";

  // Status label (shared between expanded header and collapsed one-liner)
  const statusLabel = isReachable
    ? intl.formatMessage({ id: `loopCard.status${loop.status.charAt(0).toUpperCase()}${loop.status.slice(1)}` })
    : intl.formatMessage({ id: "loopCard.statusUnknown" });

  // ── Click-to-expand for collapsed cards ────────────────────────────────
  const handleCollapsedClick = useCallback((): void => {
    setIsScrolledPast(false);
    // Scroll the card into view (centered) so it stays visible after expanding
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  // ── Action state ─────────────────────────────────────────────────────
  const [confirmingAction, setConfirmingAction] = useState<LoopAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear result timer on unmount
  useEffect(() => {
    return () => {
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    };
  }, []);

  const executeAction = useCallback(async (action: LoopAction): Promise<void> => {
    if (!instance) return;
    setActionLoading(true);
    setConfirmingAction(null);

    try {
      let res: { ok: boolean; error?: unknown };
      switch (action) {
        case "pause":
          res = await pauseLoop(instance, loop.id);
          break;
        case "resume":
          res = await resumeLoop(instance, loop.id);
          break;
        case "stop":
          res = await stopLoop(instance, loop.id);
          break;
        case "trigger":
          res = await triggerLoop(instance, loop.id);
          break;
      }

      if (res.ok) {
        setActionResult({ kind: "success", action });
      } else {
        const errorMsg = typeof res.error === "string"
          ? res.error
          : intl.formatMessage({ id: "loopCard.resultError" });
        setActionResult({ kind: "error", message: errorMsg });
      }
    } catch {
      setActionResult({ kind: "error", message: intl.formatMessage({ id: "loopCard.resultError" }) });
    } finally {
      setActionLoading(false);
    }

    // Auto-clear result after timeout
    const duration = actionResult?.kind === "error" ? ERROR_DISPLAY_MS : RESULT_DISPLAY_MS;
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    resultTimerRef.current = setTimeout(() => {
      setActionResult(null);
    }, duration);
  }, [instance, loop.id, intl, actionResult?.kind]);

  const handleActionClick = useCallback((action: LoopAction): void => {
    if (needsConfirmation(action, loop.status)) {
      setConfirmingAction(action);
    } else {
      void executeAction(action);
    }
  }, [executeAction, loop.status]);

  const handleConfirmCancel = useCallback((): void => {
    setConfirmingAction(null);
  }, []);

  const handleConfirmExecute = useCallback((): void => {
    if (confirmingAction) {
      void executeAction(confirmingAction);
    }
  }, [confirmingAction, executeAction]);

  // Available actions for this loop
  const availableActions = isReachable && instance ? getAvailableActions(loop.status) : [];

  // ── Task chain expansion ─────────────────────────────────────────────
  const [chainExpanded, setChainExpanded] = useState(false);
  const [chainTasks, setChainTasks] = useState<TaskDefinition[] | null>(null);
  const [chainLoading, setChainLoading] = useState(false);

  const chainSteps = useMemo(
    () => resolveTaskChain(loop.taskId, chainTasks ?? []),
    [loop.taskId, chainTasks],
  );

  const handleToggleChain = useCallback((): void => {
    if (chainExpanded) {
      setChainExpanded(false);
      return;
    }

    if (chainTasks !== null) {
      // Already fetched — just toggle
      setChainExpanded(true);
      return;
    }

    if (!instance || !isReachable) return;

    setChainLoading(true);
    void fetchTasks(instance).then((res) => {
      if (res.ok && res.data) {
        setChainTasks(res.data);
      } else {
        setChainTasks([]);
      }
      setChainExpanded(true);
      setChainLoading(false);
    }).catch(() => {
      setChainTasks([]);
      setChainExpanded(true);
      setChainLoading(false);
    });
  }, [chainExpanded, chainTasks, instance, isReachable, loop.taskId]);

  // Whether the loop has a taskId (prerequisite for showing the expand affordance)
  const hasTaskChain = loop.taskId != null && loop.taskId !== "";

  // ── Chain version invalidation ─────────────────────────────────────────
  // When chainVersion changes (e.g., after a chain-edit proposal is applied),
  // clear the cached chain tasks so the next expand fetches fresh data.
  useEffect(() => {
    if (chainVersion !== undefined && chainVersion > 0) {
      setChainTasks(null);
      // If the chain is currently expanded, re-fetch immediately
      if (chainExpanded && instance && isReachable) {
        setChainLoading(true);
        void fetchTasks(instance).then((res) => {
          if (res.ok && res.data) {
            setChainTasks(res.data);
          } else {
            setChainTasks([]);
          }
          setChainLoading(false);
        }).catch(() => {
          setChainTasks([]);
          setChainLoading(false);
        });
      }
    }
  }, [chainVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live log streaming ─────────────────────────────────────────────────
  const [logLines, setLogLines] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [streamState, setStreamState] = useState<StreamState | null>(null);

  // Track whether the card is in the viewport
  const [isVisible, setIsVisible] = useState(true);
  // Track whether the card has scrolled above the viewport (for auto-collapse)
  const [isScrolledPast, setIsScrolledPast] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Ref for the log content div (autoscroll target)
  const logContentRef = useRef<HTMLDivElement | null>(null);

  // Track whether user has scrolled up (disable autoscroll)
  const autoScrollRef = useRef(true);

  // ── IntersectionObserver for visibility + collapse gating ────────────
  // When a scrollContainerRef is provided, we root the observer to the
  // scroll container so we can detect when the card scrolls above the
  // viewport (scrolled past → collapsed). Cards that are merely below the
  // fold are not collapsed so they appear expanded when the user scrolls down.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const rootEl = scrollContainerRef?.current ?? null;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);

        if (rootEl && !entry.isIntersecting) {
          // Card is out of view. Determine direction: if the card's bottom
          // edge is above the root's top edge, it was scrolled past (above).
          const rootBounds = entry.rootBounds;
          if (rootBounds) {
            const scrolledAbove = entry.boundingClientRect.bottom < rootBounds.top;
            setIsScrolledPast(scrolledAbove);
          }
        } else if (entry.isIntersecting) {
          setIsScrolledPast(false);
        }
      },
      { root: rootEl, threshold: 0 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollContainerRef]);

  // ── Initial tail fetch ────────────────────────────────────────────────
  useEffect(() => {
    if (!instance || !isReachable) {
      setLogLines([]);
      return;
    }

    let cancelled = false;
    void fetchLogs(instance, loop.id, LOG_TAIL_SIZE).then((res) => {
      if (cancelled) return;
      if (res.ok && typeof res.data === "string" && res.data.length > 0) {
        const lines = res.data.split(/\r?\n/).filter((l) => l.length > 0);
        setLogLines(lines);
      } else {
        setLogLines([]);
      }
    }).catch(() => {
      if (!cancelled) setLogLines([]);
    });

    return () => {
      cancelled = true;
    };
  }, [instance?.id, instance?.activeEndpointId, loop.id, isReachable]);

  // ── SSE live subscription (visibility-gated) ──────────────────────────
  // Cleanup ref for the current subscription
  const unsubRef = useRef<(() => void) | null>(null);

  // Subscribe when visible + reachable + instance available, unsubscribe otherwise
  useEffect(() => {
    // Tear down existing subscription
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    if (!isVisible || !instance || !isReachable) {
      setStreamState((prev) => prev !== null ? null : prev);
      return;
    }

    // Only subscribe if the loop is running or waiting (active states that produce output)
    const isActive = loop.status === "running" || loop.status === "waiting";
    if (!isActive) {
      setStreamState((prev) => prev !== null ? null : prev);
      return;
    }

    setStreamState("connected");

    const unsub = subscribeLogs(
      instance,
      loop.id,
      (line: string) => {
        setLogLines((prev) => {
          const next = [...prev, line];
          return next.length > MAX_LOG_LINES ? next.slice(next.length - MAX_LOG_LINES) : next;
        });
      },
      // onClose — stream ended or errored
      () => {
        // The SSE stream for logs typically ends when the run finishes.
        // Set to stopped so the UI reflects the stream is no longer active.
        setStreamState("stopped");
      },
    );

    unsubRef.current = unsub;

    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, [isVisible, instance?.id, instance?.activeEndpointId, loop.id, loop.status, isReachable]);

  // ── Autoscroll ────────────────────────────────────────────────────────
  const handleLogScroll = useCallback(() => {
    const el = logContentRef.current;
    if (!el) return;
    // If user is within 30px of the bottom, keep autoscroll enabled
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    autoScrollRef.current = atBottom;
  }, []);

  useEffect(() => {
    if (autoScrollRef.current && logContentRef.current) {
      logContentRef.current.scrollTop = logContentRef.current.scrollHeight;
    }
  }, [logLines]);

  const copyLogs = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(logLines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable, ignore
    }
  };

  // ── Card classes ───────────────────────────────────────────────────────
  const cardCls = [
    "loop-card",
    failed ? "loop-card--failed" : "",
    !isReachable ? "loop-card--unreachable" : "",
    isScrolledPast ? "loop-card--collapsed" : "",
  ].filter(Boolean).join(" ");

  // Whether to render the log tail section
  const showLogTail = instance && isReachable && logLines.length > 0;

  // Whether to show action buttons
  const showActions = availableActions.length > 0;

  return (
    <div className={cardCls} ref={cardRef}>
      {isScrolledPast ? (
        /* ── Collapsed one-liner: status dot + name + status ── */
        <div className="loop-card-header" onClick={handleCollapsedClick} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleCollapsedClick(); }}
        >
          <span
            className={`dot loop-card-dot${isPulsing ? " loop-card-dot--pulse" : ""}`}
            style={{ background: dotColor }}
          />
          <span className="loop-card-name">{name}</span>
          <span className="loop-card-collapsed-sep">{"\u2014"}</span>
          <span
            className="loop-card-status-chip"
            style={{ color: isReachable ? STATUS_COLORS[loop.status] : "var(--status-unknown)" }}
          >
            {statusLabel}
          </span>
        </div>
      ) : (
        <>
          {/* Header row: status dot + name */}
          <div className="loop-card-header">
            <span
              className={`dot loop-card-dot${isPulsing ? " loop-card-dot--pulse" : ""}`}
              style={{ background: dotColor }}
            />
            <span className="loop-card-name">{name}</span>
            <span
              className="loop-card-status-chip"
              style={{ color: isReachable ? STATUS_COLORS[loop.status] : "var(--status-unknown)" }}
            >
              {statusLabel}
            </span>
          </div>

          {/* Meta row: interval · runs · last exit · next run · expand chain */}
          <div className="loop-card-meta">
            <span className="loop-card-meta-item">
              <span className="loop-card-meta-label">{intl.formatMessage({ id: "loopCard.interval" })}</span>
              <span className="loop-card-meta-value">{loop.intervalHuman}</span>
            </span>
            <span className="loop-card-meta-sep" />
            <span className="loop-card-meta-item">
              <span className="loop-card-meta-label">{intl.formatMessage({ id: "loopCard.runs" })}</span>
              <span className="loop-card-meta-value loop-card-meta-value--mono">{runCountLabel}</span>
            </span>
            <span className="loop-card-meta-sep" />
            <span className="loop-card-meta-item">
              <span className="loop-card-meta-label">{intl.formatMessage({ id: "loopCard.lastExit" })}</span>
              <span
                className={`loop-card-meta-value loop-card-meta-value--mono${failed ? " loop-card-meta-value--exit-fail" : ""}`}
              >
                {exitCodeLabel}
              </span>
            </span>
            <span className="loop-card-meta-sep" />
            <span className="loop-card-meta-item">
              <span className="loop-card-meta-label">{intl.formatMessage({ id: "loopCard.nextRun" })}</span>
              <span className="loop-card-meta-value loop-card-meta-value--mono">{isRunning ? intl.formatMessage({ id: "loopCard.runningNow" }) : nextRunLabel}</span>
            </span>
            {hasTaskChain && instance && isReachable && (
              <>
                <span className="loop-card-meta-sep" />
                <button
                  className={`loop-card-chain-toggle${chainExpanded ? " loop-card-chain-toggle--expanded" : ""}`}
                  onClick={handleToggleChain}
                  disabled={chainLoading}
                  title={intl.formatMessage({ id: "loopCard.expandChain" })}
                  type="button"
                >
                  <span className="loop-card-chain-toggle-icon">{chainExpanded ? "▾" : "▸"}</span>
                  <span className="loop-card-chain-toggle-label">
                    {chainLoading
                      ? intl.formatMessage({ id: "loopCard.chainLoading" })
                      : intl.formatMessage({ id: "loopCard.tasks" })}
                  </span>
                </button>
              </>
            )}
          </div>

          {/* Task chain expansion */}
          {chainExpanded && chainTasks !== null && (
            <TaskChainView steps={chainSteps} />
          )}

          {/* Log tail: compact monospace output with copy affordance */}
          {showLogTail && (
            <div className="loop-card-log-tail">
              <div className="loop-card-log-tail-header">
                <span className="loop-card-log-tail-label">
                  {intl.formatMessage({ id: "loopCard.outputLabel" })}
                  {streamState === "connected" && (
                    <span className="loop-card-log-live-dot" title={intl.formatMessage({ id: "loopCard.live" })} />
                  )}
                  {streamState === "connected" && (
                    <span className="loop-card-log-live-label">{intl.formatMessage({ id: "loopCard.live" })}</span>
                  )}
                </span>
                <button className="loop-card-log-tail-copy" onClick={() => void copyLogs()}>
                  {copied
                    ? intl.formatMessage({ id: "loopCard.copied" })
                    : intl.formatMessage({ id: "loopCard.copy" })}
                </button>
              </div>
              <div className="loop-card-log-tail-content" ref={logContentRef} onScroll={handleLogScroll}>
                {logLines.map((line, idx) => {
                  const classified = classifyLogLine(line);
                  const isError = classified.kind === "exit" && (classified.exitCode ?? 0) !== 0;
                  return (
                    <div
                      key={idx}
                      className={`loop-card-log-tail-line${isError ? " loop-card-log-tail-line--error" : ""}`}
                    >
                      {line}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action result feedback */}
          {actionResult && (
            <div className={`loop-card-action-result${actionResult.kind === "error" ? " loop-card-action-result--error" : ""}`}>
              {actionResult.kind === "success"
                ? intl.formatMessage({ id: actionResultLabel(actionResult.action) })
                : actionResult.message}
            </div>
          )}

          {/* Action buttons */}
          {showActions && !actionResult && (
            <div className="loop-card-actions">
              {availableActions.map((action) => (
                <button
                  key={action}
                  className={`loop-card-action-btn loop-card-action-btn--${action}`}
                  disabled={actionLoading}
                  onClick={() => handleActionClick(action)}
                >
                  {intl.formatMessage({ id: actionButtonLabel(action) })}
                </button>
              ))}
            </div>
          )}

          {/* Confirmation overlay */}
          {confirmingAction && (
            <div className="loop-card-confirm-overlay">
              <div className="loop-card-confirm-content">
                <div className="loop-card-confirm-title">
                  {intl.formatMessage({ id: confirmTitleKey(confirmingAction) })}
                </div>
                <div className="loop-card-confirm-description">
                  {intl.formatMessage({ id: confirmDescriptionKey(confirmingAction) })}
                </div>
                <div className="loop-card-confirm-buttons">
                  <button
                    className="loop-card-confirm-btn loop-card-confirm-btn--cancel"
                    onClick={handleConfirmCancel}
                  >
                    {intl.formatMessage({ id: "loopCard.confirmCancel" })}
                  </button>
                  <button
                    className="loop-card-confirm-btn loop-card-confirm-btn--confirm"
                    onClick={handleConfirmExecute}
                    disabled={actionLoading}
                  >
                    {intl.formatMessage({ id: actionButtonLabel(confirmingAction) })}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
