import { standaloneIntl } from "./i18n";

export type FleetItemStatus =
  | "pending-approval"
  | "awaiting-input"
  | "working"
  | "completed"
  | "failed"
  | "idle"
  | "unknown";

export const PRIORITY_ORDER: FleetItemStatus[] = [
  "pending-approval",
  "awaiting-input",
  "failed",
  "working",
  "completed",
  "idle",
  "unknown",
];

export const PRIORITY_RANK: Record<FleetItemStatus, number> = Object.fromEntries(
  PRIORITY_ORDER.map((s, i) => [s, i]),
) as Record<FleetItemStatus, number>;

const PILL_LABEL_KEYS: Record<FleetItemStatus, string> = {
  "pending-approval": "fleet.approval",
  "awaiting-input": "fleet.input",
  working: "fleet.working",
  completed: "fleet.done",
  failed: "fleet.failed",
  idle: "fleet.idle",
  unknown: "fleet.unknown",
};

export function getPillLabel(status: FleetItemStatus): string {
  return standaloneIntl.formatMessage({ id: PILL_LABEL_KEYS[status] });
}

export const PILL_COLORS: Record<FleetItemStatus, string> = {
  "pending-approval": "var(--pill-approval)",
  "awaiting-input": "var(--pill-input)",
  failed: "var(--pill-failed)",
  working: "var(--pill-working)",
  completed: "var(--pill-done)",
  idle: "var(--pill-idle)",
  unknown: "var(--pill-unknown)",
};

export function highestPriority(statuses: FleetItemStatus[]): FleetItemStatus {
  if (statuses.length === 0) return "idle";
  let best: FleetItemStatus = statuses[0];
  let bestRank = PRIORITY_RANK[statuses[0]] ?? PRIORITY_RANK["idle"];
  for (let i = 1; i < statuses.length; i++) {
    const s = statuses[i];
    const r = PRIORITY_RANK[s] ?? PRIORITY_RANK["idle"];
    if (r < bestRank) {
      bestRank = r;
      best = s;
    }
  }
  return best;
}

export function rollUpEnvironmentStatus(
  childStatuses: FleetItemStatus[],
): FleetItemStatus {
  return highestPriority(childStatuses);
}

export function isNotifiableStatus(status: FleetItemStatus): boolean {
  return (
    status === "pending-approval" ||
    status === "awaiting-input" ||
    status === "failed"
  );
}
