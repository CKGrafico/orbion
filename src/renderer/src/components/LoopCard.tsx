import React, { useCallback, useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import type { Environment, LoopMeta, LoopStatus } from "../types";
import { STATUS_COLORS, commandLine, timeUntil } from "../format";
import { fetchLogs, subscribeLogs } from "../api";
import { classifyLogLine } from "./log-types";
import { useNextRunCountdown } from "./useNextRunCountdown";
import type { StreamState } from "./useLiveLog";

interface LoopCardProps {
  /** The loop to display. Updated live from the loop store. */
  loop: LoopMeta;
  /** Whether the instance hosting this loop is reachable. */
  reachability?: "connected" | "reconnecting" | "unreachable";
  /** The environment-instance that hosts this loop. When provided, the card shows a log tail. */
  instance?: Environment;
}

/** Pulse animation for running status dots. */
const PULSING_STATUSES: Set<LoopStatus> = new Set(["running"]);

/** Number of tail lines to fetch initially. */
const LOG_TAIL_SIZE = 10;

/** Maximum in-memory lines for the compact card log view. */
const MAX_LOG_LINES = 50;

export function LoopCard({ loop, reachability, instance }: LoopCardProps): React.ReactNode {
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

  // ── Live log streaming ─────────────────────────────────────────────────
  const [logLines, setLogLines] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [streamState, setStreamState] = useState<StreamState | null>(null);

  // Track whether the card is in the viewport
  const [isVisible, setIsVisible] = useState(true);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Ref for the log content div (autoscroll target)
  const logContentRef = useRef<HTMLDivElement | null>(null);

  // Track whether user has scrolled up (disable autoscroll)
  const autoScrollRef = useRef(true);

  // ── IntersectionObserver for visibility gating ────────────────────────
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
  ].filter(Boolean).join(" ");

  // Whether to render the log tail section
  const showLogTail = instance && isReachable && logLines.length > 0;

  return (
    <div className={cardCls} ref={cardRef}>
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
          {isReachable
            ? intl.formatMessage({ id: `loopCard.status${loop.status.charAt(0).toUpperCase()}${loop.status.slice(1)}` })
            : intl.formatMessage({ id: "loopCard.statusUnknown" })}
        </span>
      </div>

      {/* Meta row: interval · runs · last exit · next run */}
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
      </div>

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
    </div>
  );
}
