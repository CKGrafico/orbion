import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Environment, LoopMeta, LoopStatus, TaskDefinition } from "../types";
import { STATUS_COLORS, commandLine, timeUntil } from "../format";
import { fetchLogs, fetchTasks, pauseLoop, resumeLoop, stopLoop, subscribeLogs, triggerLoop } from "../api";
import { classifyLogLine } from "./log-types";
import { useNextRunCountdown } from "./useNextRunCountdown";
import type { StreamState } from "./useLiveLog";
import { resolveTaskChain, TaskChainView } from "./TaskChainView";

interface LoopCardProps {
  loop: LoopMeta;
  reachability?: "connected" | "reconnecting" | "unreachable";
  instance?: Environment;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  chainVersion?: number;
}

const PULSING_STATUSES: Set<LoopStatus> = new Set(["running"]);
const LOG_TAIL_SIZE = 10;
const MAX_LOG_LINES = 50;
const RESULT_DISPLAY_MS = 2000;
const ERROR_DISPLAY_MS = 4000;

type LoopAction = "pause" | "resume" | "stop" | "trigger";
type ActionResult =
  | { kind: "success"; action: LoopAction }
  | { kind: "error"; message: string };

/** running→Pause,Stop; waiting→Pause,Stop,RunNow; paused→Resume,Stop,RunNow; stopped→RunNow; failed→Stop,RunNow; finished→none */
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

/** Stop always confirms; pause of running confirms; trigger on stopped confirms. */
function needsConfirmation(action: LoopAction, status: LoopStatus): boolean {
  if (action === "stop") return true;
  if (action === "pause" && status === "running") return true;
  if (action === "trigger" && status === "stopped") return true;
  return false;
}

function actionResultLabel(action: LoopAction): string {
  switch (action) {
    case "pause": return "loopCard.resultPaused";
    case "resume": return "loopCard.resultResumed";
    case "stop": return "loopCard.resultStopped";
    case "trigger": return "loopCard.resultTriggered";
  }
}

function actionButtonLabel(action: LoopAction): string {
  switch (action) {
    case "pause": return "loopCard.actionPause";
    case "resume": return "loopCard.actionResume";
    case "stop": return "loopCard.actionStop";
    case "trigger": return "loopCard.actionRunNow";
  }
}

function confirmTitleKey(action: LoopAction): string {
  switch (action) {
    case "pause": return "loopCard.confirmPauseTitle";
    case "stop": return "loopCard.confirmStopTitle";
    case "trigger": return "loopCard.confirmRunNowTitle";
    default: return "loopCard.confirmRunNowTitle";
  }
}

function confirmDescriptionKey(action: LoopAction): string {
  switch (action) {
    case "pause": return "loopCard.confirmPauseDescription";
    case "stop": return "loopCard.confirmStopDescription";
    case "trigger": return "loopCard.confirmRunNowDescription";
    default: return "loopCard.confirmRunNowDescription";
  }
}

export function LoopCard({ loop, reachability, instance, scrollContainerRef, chainVersion }: LoopCardProps): React.ReactNode {
  const { t } = useTranslation();

  // Defensive: the real API may omit array fields that the type declares as required
  const safeLoop = useMemo(() => {    if (!loop) {
      console.error("[LoopCard] loop prop is undefined/null");
      return { id: "", status: "stopped" as LoopStatus, command: "", commandArgs: [], cwd: "", intervalHuman: "", maxRuns: null, runCount: 0, skippedCount: 0, lastExitCode: null, lastRunAt: null, nextRunAt: null, pid: null, runHistory: [], taskId: null };
    }
    return {
      ...loop,
      commandArgs: loop.commandArgs ?? [],
      runHistory: loop.runHistory ?? [],
    };
  }, [loop]);

  const isReachable = reachability === "connected" || reachability === undefined;
  const failed = safeLoop.lastExitCode !== null && safeLoop.lastExitCode !== 0;
  const isRunning = safeLoop.status === "running";
  const isPulsing = PULSING_STATUSES.has(safeLoop.status);

  const name = safeLoop.description?.trim() || commandLine(safeLoop.command, safeLoop.commandArgs) || safeLoop.id;

  const countdown = useNextRunCountdown(safeLoop.nextRunAt);
  const nextRunLabel = isReachable
    ? (countdown ?? (safeLoop.nextRunAt ? timeUntil(safeLoop.nextRunAt) : t("loopCard.noNextRun")))
    : t("loopCard.unknown");

  const exitCodeLabel = safeLoop.lastExitCode === null
    ? "-"
    : String(safeLoop.lastExitCode);

  const runCountLabel = safeLoop.maxRuns
    ? `${safeLoop.runCount}/${safeLoop.maxRuns}`
    : String(safeLoop.runCount);

  const dotColor = isReachable
    ? (STATUS_COLORS[safeLoop.status] ?? "var(--text-secondary)")
    : "var(--status-unknown)";

  const statusLabel = isReachable
    ? t(`loopCard.status${safeLoop.status.charAt(0).toUpperCase()}${safeLoop.status.slice(1)}`)
    : t("loopCard.statusUnknown");

  const handleCollapsedClick = useCallback((): void => {
    setIsScrolledPast(false);
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const [confirmingAction, setConfirmingAction] = useState<LoopAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          res = await pauseLoop(instance, safeLoop.id);
          break;
        case "resume":
          res = await resumeLoop(instance, safeLoop.id);
          break;
        case "stop":
          res = await stopLoop(instance, safeLoop.id);
          break;
        case "trigger":
          res = await triggerLoop(instance, safeLoop.id);
          break;
      }

      if (res.ok) {
        setActionResult({ kind: "success", action });
      } else {
        const errorMsg = typeof res.error === "string"
          ? res.error
          : t("loopCard.resultError");
        setActionResult({ kind: "error", message: errorMsg });
      }
    } catch {
      setActionResult({ kind: "error", message: t("loopCard.resultError") });
    } finally {
      setActionLoading(false);
    }

    const duration = actionResult?.kind === "error" ? ERROR_DISPLAY_MS : RESULT_DISPLAY_MS;
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    resultTimerRef.current = setTimeout(() => {
      setActionResult(null);
    }, duration);
  }, [instance, safeLoop.id, t, actionResult?.kind]);

  const handleActionClick = useCallback((action: LoopAction): void => {
    if (needsConfirmation(action, safeLoop.status)) {
      setConfirmingAction(action);
    } else {
      void executeAction(action);
    }
  }, [executeAction, safeLoop.status]);

  const handleConfirmCancel = useCallback((): void => {
    setConfirmingAction(null);
  }, []);

  const handleConfirmExecute = useCallback((): void => {
    if (confirmingAction) {
      void executeAction(confirmingAction);
    }
  }, [confirmingAction, executeAction]);

  const availableActions = isReachable && instance ? getAvailableActions(safeLoop.status) : [];

  const [chainExpanded, setChainExpanded] = useState(false);
  const [chainTasks, setChainTasks] = useState<TaskDefinition[] | null>(null);
  const [chainLoading, setChainLoading] = useState(false);

  const chainSteps = useMemo(
    () => resolveTaskChain(safeLoop.taskId, chainTasks ?? []),
    [safeLoop.taskId, chainTasks],
  );

  const handleToggleChain = useCallback((): void => {
    if (chainExpanded) {
      setChainExpanded(false);
      return;
    }

    if (chainTasks !== null) {
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
  }, [chainExpanded, chainTasks, instance, isReachable, safeLoop.taskId]);

  const hasTaskChain = safeLoop.taskId != null && safeLoop.taskId !== "";

  // When chainVersion changes, clear cached chain tasks so the next expand fetches fresh data.
  useEffect(() => {
    if (chainVersion !== undefined && chainVersion > 0) {
      setChainTasks(null);
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

  const [logLines, setLogLines] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [streamState, setStreamState] = useState<StreamState | null>(null);

  const [isVisible, setIsVisible] = useState(true);
  const [isScrolledPast, setIsScrolledPast] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const logContentRef = useRef<HTMLDivElement | null>(null);

  const autoScrollRef = useRef(true);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const rootEl = scrollContainerRef?.current ?? null;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);

        if (rootEl && !entry.isIntersecting) {
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

  useEffect(() => {
    if (!instance || !isReachable) {
      setLogLines([]);
      return;
    }

    let cancelled = false;
    void fetchLogs(instance, safeLoop.id, LOG_TAIL_SIZE).then((res) => {
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
  }, [instance?.id, instance?.activeEndpointId, safeLoop.id, isReachable]);

  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    if (!isVisible || !instance || !isReachable) {
      setStreamState((prev) => prev !== null ? null : prev);
      return;
    }

    const isActive = safeLoop.status === "running" || safeLoop.status === "waiting";
    if (!isActive) {
      setStreamState((prev) => prev !== null ? null : prev);
      return;
    }

    setStreamState("connected");

    const unsub = subscribeLogs(
      instance,
      safeLoop.id,
      (line: string) => {
        setLogLines((prev) => {
          const next = [...prev, line];
          return next.length > MAX_LOG_LINES ? next.slice(next.length - MAX_LOG_LINES) : next;
        });
      },
      () => {
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
  }, [isVisible, instance?.id, instance?.activeEndpointId, safeLoop.id, safeLoop.status, isReachable]);

  const handleLogScroll = useCallback(() => {
    const el = logContentRef.current;
    if (!el) return;
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
    }
  };

  const cardCls = [
    "loop-card",
    failed ? "loop-card--failed" : "",
    !isReachable ? "loop-card--unreachable" : "",
    isScrolledPast ? "loop-card--collapsed" : "",
  ].filter(Boolean).join(" ");

  const showLogTail = instance && isReachable && logLines.length > 0;

  const showActions = availableActions.length > 0;

  return (
    <div className={cardCls} ref={cardRef}>
      {isScrolledPast ? (
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
            style={{ color: isReachable ? STATUS_COLORS[safeLoop.status] : "var(--status-unknown)" }}
          >
            {statusLabel}
          </span>
        </div>
      ) : (
        <>
          <div className="loop-card-header">
            <span
              className={`dot loop-card-dot${isPulsing ? " loop-card-dot--pulse" : ""}`}
              style={{ background: dotColor }}
            />
            <span className="loop-card-name">{name}</span>
            <span
              className="loop-card-status-chip"
              style={{ color: isReachable ? STATUS_COLORS[safeLoop.status] : "var(--status-unknown)" }}
            >
              {statusLabel}
            </span>
          </div>

          <div className="loop-card-meta">
            <span className="loop-card-meta-item">
              <span className="loop-card-meta-label">{t("loopCard.interval")}</span>
              <span className="loop-card-meta-value">{safeLoop.intervalHuman}</span>
            </span>
            <span className="loop-card-meta-sep" />
            <span className="loop-card-meta-item">
              <span className="loop-card-meta-label">{t("loopCard.runs")}</span>
              <span className="loop-card-meta-value loop-card-meta-value--mono">{runCountLabel}</span>
            </span>
            <span className="loop-card-meta-sep" />
            <span className="loop-card-meta-item">
              <span className="loop-card-meta-label">{t("loopCard.lastExit")}</span>
              <span
                className={`loop-card-meta-value loop-card-meta-value--mono${failed ? " loop-card-meta-value--exit-fail" : ""}`}
              >
                {exitCodeLabel}
              </span>
            </span>
            <span className="loop-card-meta-sep" />
            <span className="loop-card-meta-item">
              <span className="loop-card-meta-label">{t("loopCard.nextRun")}</span>
              <span className="loop-card-meta-value loop-card-meta-value--mono">{isRunning ? t("loopCard.runningNow") : nextRunLabel}</span>
            </span>
            {hasTaskChain && instance && isReachable && (
              <>
                <span className="loop-card-meta-sep" />
                <button
                  className={`loop-card-chain-toggle${chainExpanded ? " loop-card-chain-toggle--expanded" : ""}`}
                  onClick={handleToggleChain}
                  disabled={chainLoading}
                  title={t("loopCard.expandChain")}
                  type="button"
                >
                  <span className="loop-card-chain-toggle-icon">{chainExpanded ? "▾" : "▸"}</span>
                  <span className="loop-card-chain-toggle-label">
                    {chainLoading
                      ? t("loopCard.chainLoading")
                      : t("loopCard.tasks")}
                  </span>
                </button>
              </>
            )}
          </div>

          {chainExpanded && chainTasks !== null && (
            <TaskChainView steps={chainSteps} />
          )}

          {showLogTail && (
            <div className="loop-card-log-tail">
              <div className="loop-card-log-tail-header">
                <span className="loop-card-log-tail-label">
                  {t("loopCard.outputLabel")}
                  {streamState === "connected" && (
                    <span className="loop-card-log-live-dot" title={t("loopCard.live")} />
                  )}
                  {streamState === "connected" && (
                    <span className="loop-card-log-live-label">{t("loopCard.live")}</span>
                  )}
                </span>
                <button className="loop-card-log-tail-copy" onClick={() => void copyLogs()}>
                  {copied
                    ? t("loopCard.copied")
                    : t("loopCard.copy")}
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

          {actionResult && (
            <div className={`loop-card-action-result${actionResult.kind === "error" ? " loop-card-action-result--error" : ""}`}>
              {actionResult.kind === "success"
                ? t(actionResultLabel(actionResult.action))
                : actionResult.message}
            </div>
          )}

          {showActions && !actionResult && (
            <div className="loop-card-actions">
              {availableActions.map((action) => (
                <button
                  key={action}
                  className={`loop-card-action-btn loop-card-action-btn--${action}`}
                  disabled={actionLoading}
                  onClick={() => handleActionClick(action)}
                >
                  {t(actionButtonLabel(action))}
                </button>
              ))}
            </div>
          )}

          {confirmingAction && (
            <div className="loop-card-confirm-overlay">
              <div className="loop-card-confirm-content">
                <div className="loop-card-confirm-title">
                  {t(confirmTitleKey(confirmingAction))}
                </div>
                <div className="loop-card-confirm-description">
                  {t(confirmDescriptionKey(confirmingAction))}
                </div>
                <div className="loop-card-confirm-buttons">
                  <button
                    className="loop-card-confirm-btn loop-card-confirm-btn--cancel"
                    onClick={handleConfirmCancel}
                  >
                    {t("loopCard.confirmCancel")}
                  </button>
                  <button
                    className="loop-card-confirm-btn loop-card-confirm-btn--confirm"
                    onClick={handleConfirmExecute}
                    disabled={actionLoading}
                  >
                    {t(actionButtonLabel(confirmingAction))}
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
