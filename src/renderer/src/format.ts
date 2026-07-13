import type { LoopStatus } from "./types";
import { standaloneIntl } from "./i18n";

// Status palette matches the loop-task TUI theme so both products read the same.
export const STATUS_COLORS: Record<LoopStatus, string> = {
  running: "var(--status-running)",
  waiting: "var(--status-waiting)",
  paused: "var(--status-paused)",
  idle: "var(--status-idle)",
  stopped: "var(--status-stopped)",
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
