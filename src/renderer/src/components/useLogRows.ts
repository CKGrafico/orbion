import { useCallback, useRef, useState } from "react";
import type { LogRow, RunSegment, LogEventPayload } from "./log-types";
import { classifyLogLine } from "./log-types";

const MAX_ROWS = 2000;

/**
 * Converts flat log lines and structured events into segmented RunSegments.
 * Before the initial tail resolves, live rows are tracked separately so
 * setInitialRows can merge+dedup them with historical tail rows.
 */
export function useLogRows() {
  const [segments, setSegments] = useState<RunSegment[]>([]);
  const rowsRef = useRef<LogRow[]>([]);
  let rowIdCounter = useRef(0);
  const tailPendingRef = useRef(true);
  const liveRowsBeforeTailRef = useRef<LogRow[]>([]);
  /** Tracks which run numbers are expanded, synced from segments state changes. */
  const expandedRunsRef = useRef<Set<number>>(new Set());

  const nextId = useCallback(() => {
    rowIdCounter.current += 1;
    return `lr-${rowIdCounter.current}`;
  }, []);

  const rebuildSegments = useCallback((rows: LogRow[]): RunSegment[] => {
    const segs: RunSegment[] = [];
    let currentRows: LogRow[] = [];
    let currentRun = 0;

    // expandedRunsRef avoids a dependency on `segments` state that would
    // cause rebuildSegments to change identity on every log line append.
    const expandedRuns = expandedRunsRef.current;

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

    if (currentRows.length > 0) {
      segs.push({
        runNumber: currentRun,
        rows: currentRows,
        expanded: expandedRuns.has(currentRun) || segs.length === 0,
      });
    }

    if (segs.length === 0 && rows.length > 0) {
      segs.push({
        runNumber: 0,
        rows,
        expanded: true,
      });
    }

    return segs;
  }, []);

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

    if (tailPendingRef.current) {
      liveRowsBeforeTailRef.current = [...liveRowsBeforeTailRef.current, ...newRows];
    }

    setSegments((_prev) => {
      const newSegs = rebuildSegments(rowsRef.current);
      const newExpanded = new Set<number>();
      for (const seg of newSegs) {
        if (seg.expanded) newExpanded.add(seg.runNumber);
      }
      expandedRunsRef.current = newExpanded;
      return newSegs;
    });
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

    if (tailPendingRef.current) {
      liveRowsBeforeTailRef.current = [...liveRowsBeforeTailRef.current, newRow];
    }

    setSegments((_prev) => {
      const newSegs = rebuildSegments(rowsRef.current);
      const newExpanded = new Set<number>();
      for (const seg of newSegs) {
        if (seg.expanded) newExpanded.add(seg.runNumber);
      }
      expandedRunsRef.current = newExpanded;
      return newSegs;
    });
  }, [nextId, rebuildSegments]);

  const rowDedupeKey = useCallback((row: LogRow): string => {
    switch (row.kind) {
      case "plain-text": return `pt:${row.text}`;
      case "run-header": return `rh:${row.runNumber}`;
      case "exit": return `ex:${row.exitCode}`;
      case "tool-call": return `tc:${row.toolKind}:${row.title}:${row.status}`;
      case "markdown": return `md:${row.content.slice(0, 80)}`;
      default: return (row as { id: string }).id;
    }
  }, []);

  const setInitialRows = useCallback((text: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    const tailRows: LogRow[] = [];

    for (const line of lines) {
      const classified = classifyLogLine(line);
      if (classified.kind === "run-header") {
        tailRows.push({
          id: nextId(),
          kind: "run-header",
          runNumber: classified.runNumber ?? 0,
          timestamp: null,
        });
      } else if (classified.kind === "exit") {
        tailRows.push({
          id: nextId(),
          kind: "exit",
          exitCode: classified.exitCode ?? 0,
        });
      } else {
        tailRows.push({
          id: nextId(),
          kind: "plain-text",
          text: line,
        });
      }
    }

    const tailKeys = new Set(tailRows.map(rowDedupeKey));
    const liveRows = liveRowsBeforeTailRef.current.filter(
      (row) => !tailKeys.has(rowDedupeKey(row)),
    );

    const merged = [...tailRows, ...liveRows];
    rowsRef.current = merged;

    tailPendingRef.current = false;
    liveRowsBeforeTailRef.current = [];

    setSegments((_prev) => {
      const expandedRuns = expandedRunsRef.current;
      const segs: RunSegment[] = [];
      let currentRows: LogRow[] = [];
      let currentRun = 0;

      for (const row of merged) {
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

      if (segs.length === 0 && merged.length > 0) {
        segs.push({
          runNumber: 0,
          rows: merged,
          expanded: true,
        });
      }

      const newExpanded = new Set<number>();
      for (const seg of segs) {
        if (seg.expanded) newExpanded.add(seg.runNumber);
      }
      expandedRunsRef.current = newExpanded;

      return segs;
    });
  }, [nextId, rowDedupeKey]);

  const toggleSegment = useCallback((runNumber: number) => {
    setSegments((prev) => {
      const next = prev.map((seg) =>
        seg.runNumber === runNumber ? { ...seg, expanded: !seg.expanded } : seg,
      );
      const expanded = new Set<number>();
      for (const seg of next) {
        if (seg.expanded) expanded.add(seg.runNumber);
      }
      expandedRunsRef.current = expanded;
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    rowsRef.current = [];
    rowIdCounter.current = 0;
    tailPendingRef.current = true;
    liveRowsBeforeTailRef.current = [];
    expandedRunsRef.current = new Set();
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
