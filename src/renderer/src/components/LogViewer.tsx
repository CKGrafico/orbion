import { useCallback, useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import type { Environment } from "../types";
import { fetchLogs } from "../api";
import { useLogRows } from "./useLogRows";
import { useLiveLog } from "./useLiveLog";
import type { StreamState } from "./useLiveLog";
import { RunCard } from "./RunCard";
import { RunSelector } from "./RunSelector";
import type { RunRecord } from "../types";

const INITIAL_TAIL = 200;

export function LogViewer(props: {
  instance: Environment;
  loopId: string;
  runHistory?: RunRecord[];
}): React.ReactNode {
  const { instance, loopId, runHistory } = props;
  const intl = useIntl();
  const { segments, appendLines, appendEvent, setInitialRows, toggleSegment, reset } = useLogRows();
  const [follow, setFollow] = useState(true);
  const [copied, setCopied] = useState(false);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const followRef = useRef(follow);
  followRef.current = follow;

  const { streamState, reconnect, stop } = useLiveLog(
    instance,
    loopId,
    (line) => appendLines([line]),
    (parsed) => appendEvent(parsed),
  );

  useEffect(() => {
    let cancelled = false;
    reset();

    void fetchLogs(instance, loopId, INITIAL_TAIL).then((res) => {
      if (cancelled) return;
      // Always call setInitialRows to mark the tail phase as resolved,
      // even when the response is empty — this ensures live rows
      // received while the request was pending are preserved via merge.
      if (res.ok && typeof res.data === "string" && res.data.length > 0) {
        setInitialRows(res.data);
      } else {
        setInitialRows("");
      }
    }).catch(() => {
      // Network error — still resolve the tail phase so live rows
      // are no longer tracked in the pre-tail buffer.
      if (!cancelled) setInitialRows("");
    });

    return () => {
      cancelled = true;
    };
  }, [instance.id, instance.activeEndpointId, loopId, setInitialRows, reset]);

  useEffect(() => {
    if (followRef.current && paneRef.current) {
      paneRef.current.scrollTop = paneRef.current.scrollHeight;
    }
  }, [segments]);

  const copyAll = async (): Promise<void> => {
    try {
      const text = segments
        .flatMap((seg) => seg.rows)
        .map((row) => {
          if (row.kind === "plain-text") return row.text;
          if (row.kind === "run-header") return `=== Run #${row.runNumber}`;
          if (row.kind === "exit") return `exit ${row.exitCode}`;
          if (row.kind === "tool-call") return row.output ?? row.title;
          if (row.kind === "markdown") return row.content;
          return "";
        })
        .join("\n");
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable, ignore
    }
  };

  const scrollToRun = useCallback((runNumber: number) => {
    const cards = paneRef.current?.querySelectorAll(".run-card");
    if (!cards) return;
    for (const card of cards) {
      if (card.getAttribute("data-run-number") === String(runNumber)) {
        card.scrollIntoView({ behavior: "smooth", block: "start" });
        // Ensure the segment is expanded
        const seg = segments.find((s) => s.runNumber === runNumber);
        if (seg && !seg.expanded) {
          toggleSegment(runNumber);
        }
        break;
      }
    }
  }, [segments, toggleSegment]);

  return (
    <div className="card">
      <div className="card-header">
        <span className="overline">{intl.formatMessage({ id: "logs.title" })}</span>
        <span className="spacer" />
        <StreamStateIndicator
          streamState={streamState}
          follow={follow}
          onToggleFollow={() => setFollow((f) => !f)}
          onReconnect={reconnect}
          onStop={stop}
        />
        <button className="toggle" onClick={() => void copyAll()}>
          {copied ? `${intl.formatMessage({ id: "logs.copied" })} ✓` : intl.formatMessage({ id: "logs.copy" })}
        </button>
      </div>

      {runHistory && runHistory.length > 0 && (
        <RunSelector runHistory={runHistory} onSelectRun={scrollToRun} />
      )}

      <div className="log-viewer" ref={paneRef} onWheel={() => setFollow(false)}>
        {segments.length === 0 ? (
          <span style={{ color: "var(--text-muted)" }}>{intl.formatMessage({ id: "logs.noOutput" })}</span>
        ) : (
          segments.map((segment) => (
            <div key={`seg-${segment.runNumber}`} data-run-number={segment.runNumber}>
              <RunCard segment={segment} onToggle={toggleSegment} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Combined stream state / follow toggle button.
 *
 * - Connected + following:  ● Following   (green dot)
 * - Connected + not following: Follow       (click to resume)
 * - Reconnecting:           ⟳ Reconnecting (auto-retrying)
 * - Stopped:                ✕ Disconnected (click to reconnect)
 */
function StreamStateIndicator(props: {
  streamState: StreamState;
  follow: boolean;
  onToggleFollow: () => void;
  onReconnect: () => void;
  onStop: () => void;
}): React.ReactNode {
  const { streamState, follow, onToggleFollow, onReconnect, onStop } = props;
  const intl = useIntl();

  if (streamState === "reconnecting") {
    return (
      <button className="toggle reconnecting" onClick={onStop}>
        {`\u21BB ${intl.formatMessage({ id: "logs.reconnecting" })}`}
      </button>
    );
  }

  if (streamState === "stopped") {
    return (
      <button className="toggle stopped" onClick={onReconnect}>
        {`\u2717 ${intl.formatMessage({ id: "logs.disconnected" })}`}
      </button>
    );
  }

  // streamState === "connected"
  return (
    <button className={`toggle${follow ? " on" : ""}`} onClick={onToggleFollow}>
      {follow
        ? `\u25CF ${intl.formatMessage({ id: "logs.following" })}`
        : intl.formatMessage({ id: "logs.follow" })}
    </button>
  );
}
