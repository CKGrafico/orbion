import { useCallback, useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import type { Environment } from "../types";
import { fetchLogs, subscribeLogs } from "../api";
import { useLogRows } from "./useLogRows";
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

  useEffect(() => {
    let cancelled = false;
    reset();

    void fetchLogs(instance, loopId, INITIAL_TAIL).then((res) => {
      if (cancelled) return;
      if (res.ok && typeof res.data === "string" && res.data.length > 0) {
        setInitialRows(res.data);
      }
    }).catch(() => { /* network error, will retry on next poll */ });

    const unsubscribe = subscribeLogs(
      instance,
      loopId,
      (line) => {
        if (!cancelled) appendLines([line]);
      },
      undefined,
      (parsed) => {
        if (!cancelled) appendEvent(parsed);
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [instance.id, instance.activeEndpointId, loopId, appendLines, appendEvent, setInitialRows, reset]);

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
        <button className={`toggle${follow ? " on" : ""}`} onClick={() => setFollow((f) => !f)}>
          {follow ? `● ${intl.formatMessage({ id: "logs.following" })}` : intl.formatMessage({ id: "logs.follow" })}
        </button>
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
