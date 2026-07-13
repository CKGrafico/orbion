import type { LoopStatus } from "./types";
import type { FleetItemStatus } from "./fleet-status";

export function loopStatusToFleetItem(status: LoopStatus, lastExitCode: number | null): FleetItemStatus {
  if (lastExitCode !== null && lastExitCode !== 0) return "failed";
  switch (status) {
    case "running":
      return "working";
    case "waiting":
      return "idle";
    case "paused":
      return "idle";
    case "idle":
      return "idle";
    case "stopped":
      return "failed";
    default:
      return "idle";
  }
}

export function chatTurnToFleetItem(turn: {
  finished: boolean;
  approval?: { resolved: boolean } | null;
  question?: { resolved: boolean } | null;
  interrupted?: boolean;
}): FleetItemStatus {
  if (turn.approval && !turn.approval.resolved) return "pending-approval";
  if (turn.question && !turn.question.resolved) return "awaiting-input";
  if (turn.interrupted) return "failed";
  if (turn.finished) return "completed";
  return "working";
}
