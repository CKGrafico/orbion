import type { ConnectionStatus } from "../../shared/ipc";
import type { LoopStatus, RunRecord, EnvironmentHealth } from "./types";
import i18n, { translateMessage } from "./i18n";

export const STATUS_COLORS: Record<LoopStatus, string> = {
  running: "var(--status-running)",
  waiting: "var(--status-waiting)",
  paused: "var(--status-paused)",
  stopped: "var(--status-stopped)",
  failed: "var(--status-failed)",
  finished: "var(--status-finished)",
};

export function timeAgo(isoDate: string | null): string {
  if (!isoDate) return i18n.t("format.emptyValue");
  const diff = Date.now() - new Date(isoDate).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 5) return i18n.t("format.justNow");
  if (secs < 60) return i18n.t("format.secondsAgo", { count: secs });
  const mins = Math.floor(secs / 60);
  if (mins < 60) return i18n.t("format.minutesAgo", { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return i18n.t("format.hoursAgo", { count: hrs });
  return i18n.t("format.daysAgo", { count: Math.floor(hrs / 24) });
}

export function timeUntil(isoDate: string | null): string {
  if (!isoDate) return i18n.t("format.emptyValue");
  const diff = Math.max(0, new Date(isoDate).getTime() - Date.now());
  const secs = Math.floor(diff / 1000);
  if (secs < 5) return i18n.t("format.now");
  if (secs < 60) return i18n.t("format.inSeconds", { count: secs });
  const mins = Math.floor(secs / 60);
  if (mins < 60) return i18n.t("format.inMinutes", { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return i18n.t("format.inHours", { count: hrs });
  return i18n.t("format.inDays", { count: Math.floor(hrs / 24) });
}

export function commandLine(command: string, args: string[] | undefined): string {
  return [command, ...(args ?? [])].join(" ").trim();
}

export function hostLabel(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    return url.host;
  } catch {
    return baseUrl;
  }
}

export function runsToday(runHistory: RunRecord[] | undefined): number {
  if (!runHistory) return 0;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  return runHistory.filter((r) => new Date(r.startedAt).getTime() >= todayMs).length;
}

export function avgDuration(runHistory: RunRecord[] | undefined): number | null {
  if (!runHistory) return null;
  const completed = runHistory.filter((r) => r.duration !== null);
  if (completed.length === 0) return null;
  const total = completed.reduce((sum, r) => sum + (r.duration ?? 0), 0);
  return Math.round(total / completed.length);
}

export function lastRunDuration(runHistory: RunRecord[] | undefined): number | null {
  if (!runHistory || runHistory.length === 0) return null;
  const last = runHistory[runHistory.length - 1];
  return last.duration;
}

export function formatDurationShort(ms: number | null): string {
  if (ms === null) return i18n.t("format.emptyValue");
  if (ms < 1000) return `${ms}ms`;
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = Math.round(secs % 60);
  return remSecs > 0 ? `${mins}m${remSecs}s` : `${mins}m`;
}

export function healthTooltip(health: EnvironmentHealth, status?: ConnectionStatus | null): string {
  if (status) {
    switch (status.phase) {
      case "connected": return i18n.t("sidebar.connected");
      case "connecting": return i18n.t("sidebar.connecting");
      case "backoff": return i18n.t("sidebar.retrying", { seconds: Math.round(status.backoffMs / 1000), failures: status.failureCount });
      case "blocked": return translateMessage(status.lastError) || i18n.t("sidebar.blockedTooltip");
      case "offline": return translateMessage(status.lastError) || i18n.t("sidebar.offlineTooltip");
    }
  }
  return health;
}
