import type { IntlShape } from "react-intl";
import type { ConnectionStatus } from "../../shared/ipc";
import type { LoopStatus, RunRecord, EnvironmentHealth } from "./types";
import { standaloneIntl, translateMessage } from "./i18n";

// Status palette matches the loop-task TUI theme so both products read the same.
// All 6 loop-task states are represented with distinct colors:
//   running  = lime-green (active work)
//   waiting  = blue (idle between runs)
//   paused   = amber (schedule kept, can resume)
//   stopped  = warm-amber (schedule cleared, must re-create)
//   failed   = red (non-zero exit)
//   finished = green (hit max-runs, success)
export const STATUS_COLORS: Record<LoopStatus, string> = {
  running: "var(--status-running)",
  waiting: "var(--status-waiting)",
  paused: "var(--status-paused)",
  stopped: "var(--status-stopped)",
  failed: "var(--status-failed)",
  finished: "var(--status-finished)",
};

export function timeAgo(isoDate: string | null): string {
  if (!isoDate) return standaloneIntl.formatMessage({ id: "format.emptyValue" });
  const diff = Date.now() - new Date(isoDate).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 5) return standaloneIntl.formatMessage({ id: "format.justNow" });
  if (secs < 60) return standaloneIntl.formatMessage({ id: "format.secondsAgo" }, { count: secs });
  const mins = Math.floor(secs / 60);
  if (mins < 60) return standaloneIntl.formatMessage({ id: "format.minutesAgo" }, { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return standaloneIntl.formatMessage({ id: "format.hoursAgo" }, { count: hrs });
  return standaloneIntl.formatMessage({ id: "format.daysAgo" }, { count: Math.floor(hrs / 24) });
}

export function timeUntil(isoDate: string | null): string {
  if (!isoDate) return standaloneIntl.formatMessage({ id: "format.emptyValue" });
  const diff = Math.max(0, new Date(isoDate).getTime() - Date.now());
  const secs = Math.floor(diff / 1000);
  if (secs < 5) return standaloneIntl.formatMessage({ id: "format.now" });
  if (secs < 60) return standaloneIntl.formatMessage({ id: "format.inSeconds" }, { count: secs });
  const mins = Math.floor(secs / 60);
  if (mins < 60) return standaloneIntl.formatMessage({ id: "format.inMinutes" }, { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return standaloneIntl.formatMessage({ id: "format.inHours" }, { count: hrs });
  return standaloneIntl.formatMessage({ id: "format.inDays" }, { count: Math.floor(hrs / 24) });
}

export function commandLine(command: string, args: string[]): string {
  return [command, ...args].join(" ").trim();
}

export function hostLabel(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    return url.host;
  } catch {
    return baseUrl;
  }
}

// ── Run activity summary (derived from runHistory) ─────────────────

/** Count how many runs started today (local midnight). */
export function runsToday(runHistory: RunRecord[]): number {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  return runHistory.filter((r) => new Date(r.startedAt).getTime() >= todayMs).length;
}

/** Average duration (ms) of completed runs; null if none have durations. */
export function avgDuration(runHistory: RunRecord[]): number | null {
  const completed = runHistory.filter((r) => r.duration !== null);
  if (completed.length === 0) return null;
  const total = completed.reduce((sum, r) => sum + (r.duration ?? 0), 0);
  return Math.round(total / completed.length);
}

/** Last run duration (ms); null if the most recent run has no duration. */
export function lastRunDuration(runHistory: RunRecord[]): number | null {
  if (runHistory.length === 0) return null;
  const last = runHistory[runHistory.length - 1];
  return last.duration;
}

/** Format a duration in ms to a compact human-readable string. */
export function formatDurationShort(ms: number | null): string {
  if (ms === null) return standaloneIntl.formatMessage({ id: "format.emptyValue" });
  if (ms < 1000) return `${ms}ms`;
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = Math.round(secs % 60);
  return remSecs > 0 ? `${mins}m${remSecs}s` : `${mins}m`;
}

export function healthTooltip(intl: IntlShape, health: EnvironmentHealth, status?: ConnectionStatus | null): string {
  if (status) {
    switch (status.phase) {
      case "connected": return intl.formatMessage({ id: "sidebar.connected" });
      case "connecting": return intl.formatMessage({ id: "sidebar.connecting" });
      case "backoff": return intl.formatMessage({ id: "sidebar.retrying" }, { seconds: Math.round(status.backoffMs / 1000), failures: status.failureCount });
      case "blocked": return translateMessage(intl, status.lastError) || intl.formatMessage({ id: "sidebar.blockedTooltip" });
      case "offline": return translateMessage(intl, status.lastError) || intl.formatMessage({ id: "sidebar.offlineTooltip" });
    }
  }
  return health;
}
