import type { LoopStatus } from "./types";
import type {ReachabilityState } from "../../shared/ipc";
import type { FleetItemStatus } from "./fleet-status";

export function loopStatusToFleetItem(
  status: LoopStatus,
  lastExitCode: number | null,
  reachability?: ReachabilityState,
): FleetItemStatus {
  if (reachability === "unreachable" || reachability === "reconnecting") {
    return "unknown";
  }

  if (lastExitCode != null && lastExitCode !== 0) {
    return "failed";
  }

  switch (status) {
    case "running":
      return "working";
    case "waiting":
      return "idle";
    case "paused":
      return "paused";
    case "stopped":
      return "failed";
    case "failed":
      return "failed";
    case "finished":
      return "completed";
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
