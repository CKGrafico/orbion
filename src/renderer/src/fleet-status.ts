export type FleetItemStatus =
  | "pending-approval"
  | "awaiting-input"
  | "working"
  | "completed"
  | "failed"
  | "idle";

export const PRIORITY_ORDER: FleetItemStatus[] = [
  "pending-approval",
  "awaiting-input",
  "failed",
  "working",
  "completed",
  "idle",
];

export const PRIORITY_RANK: Record<FleetItemStatus, number> = Object.fromEntries(
  PRIORITY_ORDER.map((s, i) => [s, i]),
) as Record<FleetItemStatus, number>;

export const PILL_LABELS: Record<FleetItemStatus, string> = {
  "pending-approval": "approval",
  "awaiting-input": "input",
  working: "working",
  completed: "done",
  failed: "failed",
  idle: "idle",
};

export const PILL_COLORS: Record<FleetItemStatus, string> = {
  "pending-approval": "#ff8484",
  "awaiting-input": "#ffcc5c",
  failed: "#ff8484",
  working: "#9fef00",
  completed: "#a4b1cd",
  idle: "#64718c",
};

export function highestPriority(statuses: FleetItemStatus[]): FleetItemStatus {
  if (statuses.length === 0) return "idle";
  let best: FleetItemStatus = "idle";
  let bestRank = PRIORITY_RANK["idle"];
  for (const s of statuses) {
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
