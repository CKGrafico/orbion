import type { LoopStatus } from "./types";
import type {ReachabilityState } from "../../shared/ipc";
import type { FleetItemStatus } from "./fleet-status";

/**
 * Map a loop's status + lastExitCode to a FleetItemStatus, taking the
 * instance's reachability into account.
 *
 * When the instance is unreachable, its loops are "unknown" (greyed) —
 * NOT "failed". A dropped tunnel never reads as your work failing.
 * When the instance is reconnecting, its loops are "unknown" as well,
 * since we can't confirm their actual state.
 *
 * "unknown" is distinct from any loop-level status: it is not in the
 * priority order and does not inflate failure tallies.
 */
export function loopStatusToFleetItem(
  status: LoopStatus,
  lastExitCode: number | null,
  reachability?: ReachabilityState,
): FleetItemStatus {
  // If the instance is unreachable or reconnecting, loops are "unknown",
  // distinct from any loop-level status. "unknown" is not in the priority
  // order and doesn't pollute failure tallies.
  if (reachability === "unreachable" || reachability === "reconnecting") {
    return "unknown";
  }

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
