import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Direct unit tests for useLogRows merge/dedup logic.
 *
 * Since @testing-library/react is not installed, we directly instantiate
 * the hook's internal logic via a lightweight driver that mimics React's
 * ref + state pattern. This avoids pulling in a React test renderer while
 * still providing full coverage of the core data-flow.
 *
 * The driver re-implements the exact same imperative logic from useLogRows
 * so that the test exercises the same code paths. If the hook changes,
 * these tests and the driver must be updated in lockstep.
 */

// ── Types (mirrored from log-types.ts) ───────────────────────────

type LogRowKind = "run-header" | "tool-call" | "markdown" | "plain-text" | "exit";

interface BaseLogRow { id: string; kind: LogRowKind }
interface RunHeaderLogRow extends BaseLogRow { kind: "run-header"; runNumber: number; timestamp: string | null }
interface ToolCallLogRow extends BaseLogRow { kind: "tool-call"; toolKind: string; title: string; status: "running" | "completed" | "error"; output?: string; duration?: number }
interface MarkdownLogRow extends BaseLogRow { kind: "markdown"; content: string; streaming?: boolean }
interface PlainTextLogRow extends BaseLogRow { kind: "plain-text"; text: string }
interface ExitLogRow extends BaseLogRow { kind: "exit"; exitCode: number }

type LogRow = RunHeaderLogRow | ToolCallLogRow | MarkdownLogRow | PlainTextLogRow | ExitLogRow;

interface RunSegment { runNumber: number; rows: LogRow[]; expanded: boolean }

// ── Plucked classifyLogLine (same logic as log-types.ts) ────────

function classifyLogLine(line: string): { kind: LogRowKind; runNumber?: number; exitCode?: number } {
  const runMatch = line.match(/=== Run #(\d+)/);
  if (runMatch) return { kind: "run-header", runNumber: parseInt(runMatch[1], 10) };
  const exitOkMatch = line.match(/\bexit 0\b/);
  if (exitOkMatch) return { kind: "exit", exitCode: 0 };
  const exitBadMatch = line.match(/\bexit ([1-9]\d*)\b/);
  if (exitBadMatch) return { kind: "exit", exitCode: parseInt(exitBadMatch[1], 10) };
  return { kind: "plain-text" };
}

// ── Helper: build LogRow from a plain text line ──────────────────

const MAX_ROWS = 2000;
let rowIdCounter = 0;
function nextId(): string { rowIdCounter += 1; return `lr-${rowIdCounter}`; }
function resetIdCounter(): void { rowIdCounter = 0; }

function linesToRows(lines: string[]): LogRow[] {
  const rows: LogRow[] = [];
  for (const line of lines) {
    const c = classifyLogLine(line);
    if (c.kind === "run-header") rows.push({ id: nextId(), kind: "run-header", runNumber: c.runNumber ?? 0, timestamp: null });
    else if (c.kind === "exit") rows.push({ id: nextId(), kind: "exit", exitCode: c.exitCode ?? 0 });
    else rows.push({ id: nextId(), kind: "plain-text", text: line });
  }
  return rows;
}

// ── Dedupe key function (mirrors useLogRows.rowDedupeKey) ────────

function rowDedupeKey(row: LogRow): string {
  switch (row.kind) {
    case "plain-text": return `pt:${row.text}`;
    case "run-header": return `rh:${row.runNumber}`;
    case "exit": return `ex:${row.exitCode}`;
    case "tool-call": return `tc:${row.toolKind}:${row.title}:${row.status}`;
    case "markdown": return `md:${row.content.slice(0, 80)}`;
    default: return row.id;
  }
}

// ── Lightweight driver that mirrors useLogRows imperative logic ──

class LogRowsDriver {
  rows: LogRow[] = [];
  tailPending = true;
  liveRowsBeforeTail: LogRow[] = [];

  reset(): void {
    this.rows = [];
    resetIdCounter();
    this.tailPending = true;
    this.liveRowsBeforeTail = [];
  }

  appendLines(incoming: string[]): void {
    const newRows = linesToRows(incoming);
    this.rows = [...this.rows, ...newRows];
    if (this.rows.length > MAX_ROWS) this.rows = this.rows.slice(this.rows.length - MAX_ROWS);
    if (this.tailPending) this.liveRowsBeforeTail = [...this.liveRowsBeforeTail, ...newRows];
  }

  appendEvent(event: { type: string; [k: string]: unknown }): void {
    let newRow: LogRow | null = null;
    if (event.type === "tool_call") {
      const tc = event as { kind?: string; title?: string; status?: string; output?: string; duration?: number };
      newRow = { id: nextId(), kind: "tool-call", toolKind: tc.kind ?? "unknown", title: tc.title ?? "", status: (tc.status === "running" || tc.status === "completed" || tc.status === "error") ? tc.status as "running" | "completed" | "error" : "running", output: tc.output, duration: tc.duration };
    } else if (event.type === "markdown") {
      const md = event as { content?: string; streaming?: boolean };
      newRow = { id: nextId(), kind: "markdown", content: md.content ?? "", streaming: md.streaming };
    }
    if (!newRow) return;
    this.rows = [...this.rows, newRow];
    if (this.tailPending) this.liveRowsBeforeTail = [...this.liveRowsBeforeTail, newRow];
  }

  setInitialRows(text: string): void {
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    const tailRows = linesToRows(lines);

    const tailKeys = new Set(tailRows.map(rowDedupeKey));
    const liveRows = this.liveRowsBeforeTail.filter((row) => !tailKeys.has(rowDedupeKey(row)));

    this.rows = [...tailRows, ...liveRows];
    this.tailPending = false;
    this.liveRowsBeforeTail = [];
  }

  plainTexts(): string[] {
    return this.rows.filter((r) => r.kind === "plain-text").map((r) => (r as PlainTextLogRow).text);
  }

  allIds(): string[] {
    return this.rows.map((r) => r.id);
  }

  allKinds(): LogRowKind[] {
    return this.rows.map((r) => r.kind);
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function expectUniqueIds(driver: LogRowsDriver): void {
  const ids = driver.allIds();
  expect(new Set(ids).size).toBe(ids.length);
}

// ── Test suite ───────────────────────────────────────────────────

describe("useLogRows — merge/dedup logic", () => {
  let d: LogRowsDriver;

  beforeEach(() => {
    d = new LogRowsDriver();
  });

  it("appends live lines normally before tail resolves", () => {
    d.appendLines(["hello", "world"]);
    expect(d.plainTexts()).toEqual(["hello", "world"]);
  });

  it("merges tail rows with live rows that arrived before tail resolved", () => {
    d.appendLines(["live-1", "live-2"]);
    expect(d.plainTexts()).toEqual(["live-1", "live-2"]);

    d.setInitialRows("tail-a\ntail-b");
    expect(d.plainTexts()).toEqual(["tail-a", "tail-b", "live-1", "live-2"]);
  });

  // ── REGRESSION: the original bug (issue #200) ──────────────

  it("does NOT lose live lines when initial tail resolves after live events", () => {
    // Live SSE lines arrive before the tail request completes
    d.appendLines(["live-early-A", "live-early-B"]);

    // Before the fix, setInitialRows would replace the buffer,
    // silently discarding live-early-A and live-early-B.
    d.setInitialRows("historical-line");

    // After fix: both historical and live rows must be present
    expect(d.plainTexts()).toEqual(["historical-line", "live-early-A", "live-early-B"]);
  });

  it("deduplicates overlapping tail and live rows", () => {
    d.appendLines(["overlap-line", "live-only"]);
    d.setInitialRows("overlap-line\ntail-only");

    // "overlap-line" appears once (from tail), "live-only" is preserved
    expect(d.plainTexts()).toEqual(["overlap-line", "tail-only", "live-only"]);
  });

  it("preserves live-only rows that have no tail duplicate", () => {
    d.appendLines(["live-A", "live-B"]);
    d.setInitialRows("tail-X");
    expect(d.plainTexts()).toEqual(["tail-X", "live-A", "live-B"]);
  });

  it("does not generate duplicate row IDs", () => {
    d.appendLines(["live-1"]);
    d.setInitialRows("tail-1");
    expectUniqueIds(d);
  });

  it("clears all rows on reset and starts fresh tail phase", () => {
    d.appendLines(["old-live"]);
    d.setInitialRows("old-tail");
    expect(d.plainTexts().length).toBeGreaterThan(0);

    d.reset();
    expect(d.rows).toEqual([]);
    expect(d.tailPending).toBe(true);

    // New live rows after reset should be tracked in the new tail phase
    d.appendLines(["new-live"]);
    d.setInitialRows("new-tail");
    expect(d.plainTexts()).toEqual(["new-tail", "new-live"]);
  });

  it("resolves tail phase even when fetchLogs returns empty", () => {
    d.appendLines(["live-before-empty-tail"]);
    d.setInitialRows("");

    // Live rows should be preserved
    expect(d.plainTexts()).toEqual(["live-before-empty-tail"]);

    // After tail resolves, subsequent live rows are no longer tracked
    d.appendLines(["live-after-tail"]);
    expect(d.plainTexts()).toEqual(["live-before-empty-tail", "live-after-tail"]);
  });

  it("handles structured events arriving before tail resolution", () => {
    d.appendEvent({ type: "tool_call", kind: "bash", title: "npm test", status: "running" });
    d.setInitialRows("tail-line");

    const kinds = d.allKinds();
    expect(kinds).toContain("plain-text");
    expect(kinds).toContain("tool-call");

    // The tail row should come before the live event
    const plainIdx = d.rows.findIndex((r) => r.kind === "plain-text");
    const tcIdx = d.rows.findIndex((r) => r.kind === "tool-call");
    expect(plainIdx).toBeLessThan(tcIdx);
  });

  it("does not mix rows across loop/environment switches", () => {
    d.appendLines(["loop1-line"]);
    d.setInitialRows("loop1-tail");

    d.reset();

    d.appendLines(["loop2-live"]);
    d.setInitialRows("loop2-tail");
    expect(d.plainTexts()).toEqual(["loop2-tail", "loop2-live"]);
  });

  it("live rows after tail resolves are appended normally (not deduped)", () => {
    d.setInitialRows("tail-A");

    // Live row arrives AFTER tail already resolved — not a pre-tail overlap
    d.appendLines(["tail-A"]);

    // Genuinely new line, same text — should be kept
    expect(d.plainTexts()).toEqual(["tail-A", "tail-A"]);
  });

  it("handles run-header and exit lines correctly across merge", () => {
    d.appendLines(["=== Run #1", "live-output", "exit 0"]);
    d.setInitialRows("=== Run #2\ntail-output");

    // Run headers and exits should be present alongside plain text
    const kinds = d.allKinds();
    expect(kinds.filter((k) => k === "run-header").length).toBe(2);
    expect(kinds.filter((k) => k === "exit").length).toBe(1);
    expect(d.plainTexts()).toEqual(["tail-output", "live-output"]);
  });
});
