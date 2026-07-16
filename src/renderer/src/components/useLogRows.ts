import { useCallback, useRef, useState } from "react";
import type { LogRow, RunSegment, LogEventPayload } from "./log-types";
import { classifyLogLine } from "./log-types";

const MAX_ROWS = 2000;

/**
 * Hook that converts flat log lines and structured events into
 * segmented RunSegments containing structured LogRow arrays.
 */
export function useLogRows() {
  const [segments, setSegments] = useState<RunSegment[]>([]);
  const rowsRef = useRef<LogRow[]>([]);
  let rowIdCounter = useRef(0);

  const nextId = useCallback(() => {
    rowIdCounter.current += 1;
    return `lr-${rowIdCounter.current}`;
  }, []);

  const rebuildSegments = useCallback((rows: LogRow[]): RunSegment[] => {
    const segs: RunSegment[] = [];
    let currentRows: LogRow[] = [];
    let currentRun = 0;

    // Track which segments were previously expanded
    const expandedRuns = new Set<number>();
    for (const seg of segments) {
      if (seg.expanded) expandedRuns.add(seg.runNumber);
    }

    for (const row of rows) {
      if (row.kind === "run-header") {
        if (currentRows.length > 0 || currentRun > 0) {
          segs.push({
            runNumber: currentRun,
            rows: currentRows,
            expanded: expandedRuns.has(currentRun) || segs.length === 0,
          });
        }
        currentRun = row.runNumber;
        currentRows = [row];
      } else {
        currentRows.push(row);
      }
    }

    // Push the last segment
    if (currentRows.length > 0) {
      segs.push({
        runNumber: currentRun,
        rows: currentRows,
        expanded: expandedRuns.has(currentRun) || segs.length === 0,
      });
    }

    // If no run headers found, wrap everything in a default segment
    if (segs.length === 0 && rows.length > 0) {
      segs.push({
        runNumber: 0,
        rows,
        expanded: true,
      });
    }

    return segs;
  }, [segments]);

  const appendLines = useCallback((incoming: string[]) => {
    const newRows: LogRow[] = [];
    for (const line of incoming) {
      const classified = classifyLogLine(line);
      if (classified.kind === "run-header") {
        newRows.push({
          id: nextId(),
          kind: "run-header",
          runNumber: classified.runNumber ?? 0,
          timestamp: null,
        });
      } else if (classified.kind === "exit") {
        newRows.push({
          id: nextId(),
          kind: "exit",
          exitCode: classified.exitCode ?? 0,
        });
      } else {
        newRows.push({
          id: nextId(),
          kind: "plain-text",
          text: line,
        });
      }
    }

    rowsRef.current = [...rowsRef.current, ...newRows];
    if (rowsRef.current.length > MAX_ROWS) {
      rowsRef.current = rowsRef.current.slice(rowsRef.current.length - MAX_ROWS);
    }

    setSegments(rebuildSegments(rowsRef.current));
  }, [nextId, rebuildSegments]);

  const appendEvent = useCallback((parsed: unknown) => {
    const event = parsed as LogEventPayload;
    if (!event || typeof event !== "object" || !("type" in event)) return;

    const newRow: LogRow | null = (() => {
      if (event.type === "tool_call") {
        const tc = event as { id?: string; kind?: string; title?: string; status?: string; output?: string; duration?: number };
        return {
          id: nextId(),
          kind: "tool-call" as const,
          toolKind: tc.kind ?? "unknown",
          title: tc.title ?? "",
          status: (tc.status === "running" || tc.status === "completed" || tc.status === "error") ? tc.status : "running",
          output: tc.output,
          duration: tc.duration,
        };
      }
      if (event.type === "markdown") {
        const md = event as { content?: string; streaming?: boolean };
        return {
          id: nextId(),
          kind: "markdown" as const,
          content: md.content ?? "",
          streaming: md.streaming,
        };
      }
      return null;
    })();

    if (!newRow) return;

    rowsRef.current = [...rowsRef.current, newRow];
    setSegments(rebuildSegments(rowsRef.current));
  }, [nextId, rebuildSegments]);

  const setInitialRows = useCallback((text: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    rowIdCounter.current = 0;
    const newRows: LogRow[] = [];

    for (const line of lines) {
      const classified = classifyLogLine(line);
      if (classified.kind === "run-header") {
        newRows.push({
          id: nextId(),
          kind: "run-header",
          runNumber: classified.runNumber ?? 0,
          timestamp: null,
        });
      } else if (classified.kind === "exit") {
        newRows.push({
          id: nextId(),
          kind: "exit",
          exitCode: classified.exitCode ?? 0,
        });
      } else {
        newRows.push({
          id: nextId(),
          kind: "plain-text",
          text: line,
        });
      }
    }

    rowsRef.current = newRows;
    // Reset segments for fresh rebuild
    setSegments((prev) => {
      const expandedRuns = new Set<number>();
      for (const seg of prev) {
        if (seg.expanded) expandedRuns.add(seg.runNumber);
      }
      const segs: RunSegment[] = [];
      let currentRows: LogRow[] = [];
      let currentRun = 0;

      for (const row of newRows) {
        if (row.kind === "run-header") {
          if (currentRows.length > 0 || currentRun > 0) {
            segs.push({
              runNumber: currentRun,
              rows: currentRows,
              expanded: expandedRuns.has(currentRun) || segs.length === 0,
            });
          }
          currentRun = row.runNumber;
          currentRows = [row];
        } else {
          currentRows.push(row);
        }
      }

      if (currentRows.length > 0) {
        segs.push({
          runNumber: currentRun,
          rows: currentRows,
          expanded: expandedRuns.has(currentRun) || segs.length === 0,
        });
      }

      if (segs.length === 0 && newRows.length > 0) {
        segs.push({
          runNumber: 0,
          rows: newRows,
          expanded: true,
        });
      }

      return segs;
    });
  }, [nextId]);

  const toggleSegment = useCallback((runNumber: number) => {
    setSegments((prev) =>
      prev.map((seg) =>
        seg.runNumber === runNumber ? { ...seg, expanded: !seg.expanded } : seg,
      ),
    );
  }, []);

  const reset = useCallback(() => {
    rowsRef.current = [];
    rowIdCounter.current = 0;
    setSegments([]);
  }, []);

  return {
    segments,
    appendLines,
    appendEvent,
    setInitialRows,
    toggleSegment,
    reset,
  };
}
