import { useCallback, useEffect, useRef, useState } from "react";
import type { Environment } from "../types";
import { fetchLogs, subscribeLogs } from "../api";

const INITIAL_TAIL = 200;
const MAX_LINES = 2000;

function classifyLine(line: string): string | undefined {
  if (line.includes("=== Run #")) return "run-header";
  if (/\bexit 0\b/.test(line)) return "exit-ok";
  if (/\bexit [1-9]\d*\b/.test(line)) return "exit-bad";
  return undefined;
}

export function LogViewer(props: { instance: Environment; loopId: string }): React.ReactNode {
  const { instance, loopId } = props;
  const [lines, setLines] = useState<string[]>([]);
  const [follow, setFollow] = useState(true);
  const [copied, setCopied] = useState(false);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const followRef = useRef(follow);
  followRef.current = follow;

  const appendLines = useCallback((incoming: string[]) => {
    setLines((prev) => {
      const next = [...prev, ...incoming];
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLines([]);

    void fetchLogs(instance, loopId, INITIAL_TAIL).then((res) => {
      if (cancelled) return;
      if (res.ok && typeof res.data === "string" && res.data.length > 0) {
        setLines(res.data.split(/\r?\n/));
      }
    });

    const unsubscribe = subscribeLogs(instance, loopId, (line) => {
      if (!cancelled) appendLines([line]);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [instance.id, instance.activeEndpointId, loopId, appendLines]);

  useEffect(() => {
    if (followRef.current && paneRef.current) {
      paneRef.current.scrollTop = paneRef.current.scrollHeight;
    }
  }, [lines]);

  const copyAll = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — ignore
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <span className="overline">Logs</span>
        <span className="spacer" />
        <button className={`toggle${follow ? " on" : ""}`} onClick={() => setFollow((f) => !f)}>
          {follow ? "● Following" : "Follow"}
        </button>
        <button className="toggle" onClick={() => void copyAll()}>
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <div className="log-viewer" ref={paneRef} onWheel={() => setFollow(false)}>
        {lines.length === 0 ? (
          <span style={{ color: "var(--text-muted)" }}>No log output yet.</span>
        ) : (
          lines.map((line, i) => {
            const cls = classifyLine(line);
            return (
              <div key={i} className={cls}>
                {line || " "}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
