import type { ConnectionPhase, ConnectionStatus } from "../shared/ipc.js";

/**
 * Tracks how long each environment stays unreachable and fires an
 * escalation callback when the outage exceeds a configurable threshold.
 *
 * Design:
 * - Quiet auto-reconnect for blips: the supervisor handles reconnect with
 *   backoff; no inbox item for outages shorter than the threshold.
 * - Prolonged outage → one inbox item + OS notification naming the
 *   instance and duration.
 * - Self-resolves on reconnect (the caller removes the inbox item).
 *
 * The tracker observes `ConnectionStatus` changes pushed by the supervisor
 * and does NOT probe on its own.
 */

/** Default threshold: 10 minutes in milliseconds. */
const DEFAULT_OUTAGE_THRESHOLD_MS = 10 * 60 * 1_000;

export interface OutageEvent {
  environmentId: string;
  /** ISO timestamp when the environment first went unreachable. */
  since: string;
  /** Elapsed milliseconds since the outage began (at the time of escalation). */
  durationMs: number;
}

export class OutageTracker {
  /** environmentId → timestamp (epoch ms) when the current outage started. */
  private outages = new Map<string, number>();
  /** environmentIds that have already been escalated in the current outage. */
  private escalated = new Set<string>();
  /** Per-environment timers for threshold checks. */
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private destroyed = false;

  private readonly thresholdMs: number;
  private readonly onEscalate: (event: OutageEvent) => void;
  private readonly onResolve: (environmentId: string) => void;

  constructor(
    onEscalate: (event: OutageEvent) => void,
    onResolve: (environmentId: string) => void,
    thresholdMs: number = DEFAULT_OUTAGE_THRESHOLD_MS,
  ) {
    this.onEscalate = onEscalate;
    this.onResolve = onResolve;
    this.thresholdMs = thresholdMs;
  }

  /**
   * Called by the connection supervisor whenever an environment's status changes.
   */
  handleStatusChange(environmentId: string, status: ConnectionStatus): void {
    if (this.destroyed) return;

    const isUnreachable = this.isUnreachablePhase(status.phase);

    if (isUnreachable) {
      if (!this.outages.has(environmentId)) {
        // Outage just started
        this.outages.set(environmentId, Date.now());
        this.scheduleThresholdCheck(environmentId);
      }
    } else {
      // Environment is reachable again
      const wasEscalated = this.escalated.has(environmentId);
      this.clearTimer(environmentId);
      this.outages.delete(environmentId);
      this.escalated.delete(environmentId);

      if (wasEscalated) {
        // Self-resolve the inbox item
        this.onResolve(environmentId);
      }
    }
  }

  /**
   * Remove an environment from tracking (e.g. when the environment is deleted).
   */
  removeEnvironment(environmentId: string): void {
    this.clearTimer(environmentId);
    this.outages.delete(environmentId);
    this.escalated.delete(environmentId);
  }

  /**
   * Get the current outage start time for an environment, or null if not in outage.
   */
  getOutageSince(environmentId: string): number | null {
    return this.outages.get(environmentId) ?? null;
  }

  /**
   * Whether the environment's outage has already been escalated.
   */
  isEscalated(environmentId: string): boolean {
    return this.escalated.has(environmentId);
  }

  destroy(): void {
    this.destroyed = true;
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.outages.clear();
    this.escalated.clear();
  }

  private isUnreachablePhase(phase: ConnectionPhase): boolean {
    return phase === "offline" || phase === "backoff" || phase === "blocked";
  }

  private scheduleThresholdCheck(environmentId: string): void {
    this.clearTimer(environmentId);

    const startedAt = this.outages.get(environmentId);
    if (!startedAt) return;

    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, this.thresholdMs - elapsed);

    const timer = setTimeout(() => {
      this.timers.delete(environmentId);
      this.checkThreshold(environmentId);
    }, remaining);

    this.timers.set(environmentId, timer);
  }

  private checkThreshold(environmentId: string): void {
    if (this.destroyed) return;

    const startedAt = this.outages.get(environmentId);
    if (!startedAt) return;

    const durationMs = Date.now() - startedAt;

    if (durationMs >= this.thresholdMs && !this.escalated.has(environmentId)) {
      this.escalated.add(environmentId);

      this.onEscalate({
        environmentId,
        since: new Date(startedAt).toISOString(),
        durationMs,
      });
    }
  }

  private clearTimer(environmentId: string): void {
    const timer = this.timers.get(environmentId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(environmentId);
    }
  }
}
