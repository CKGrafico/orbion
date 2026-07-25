import type { ConnectionPhase } from "../shared/ipc.js";
import type { ReachabilityState, ReachabilityStatus } from "../shared/ipc.js";

/**
 * Reachability is its own health layer, separate from loop status.
 * This state is NEVER derived from loop exit codes.
 */
export class ReachabilityTracker {
  private states = new Map<string, ReachabilityStatus>();
  private listeners: ((status: ReachabilityStatus) => void)[] = [];
  private destroyed = false;

  handleConnectionPhaseChange(
    environmentId: string,
    phase: ConnectionPhase,
  ): void {
    if (this.destroyed) return;

    const newState = phaseToReachability(phase);
    const existing = this.states.get(environmentId);

    if (existing && existing.state === newState) return;

    const status: ReachabilityStatus = {
      environmentId,
      state: newState,
      changedAt: new Date().toISOString(),
    };

    this.states.set(environmentId, status);
    this.emitChange(status);
  }

  removeEnvironment(environmentId: string): void {
    this.states.delete(environmentId);
  }

  getStatus(environmentId: string): ReachabilityStatus | null {
    return this.states.get(environmentId) ?? null;
  }

  getAll(): ReachabilityStatus[] {
    return [...this.states.values()];
  }

  onStatusChange(cb: (status: ReachabilityStatus) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  destroy(): void {
    this.destroyed = true;
    this.listeners.length = 0;
    this.states.clear();
  }

  private emitChange(status: ReachabilityStatus): void {
    for (const listener of this.listeners) {
      listener(status);
    }
  }
}

export function phaseToReachability(phase: ConnectionPhase): ReachabilityState {
  switch (phase) {
    case "connected":
      return "connected";
    case "connecting":
    case "backoff":
      return "reconnecting";
    case "offline":
    case "blocked":
      return "unreachable";
    default:
      return "unreachable";
  }
}
