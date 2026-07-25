import type { ConnectionPhase, ConnectionStatus } from "../shared/ipc.js";

/**
 * Tracks how long each environment stays unreachable and fires an
 * escalation callback when the outage exceeds a configurable threshold.
 *
 * - Quiet auto-reconnect for blips: no inbox item for outages shorter than the threshold.
 * - Prolonged outage → one inbox item + OS notification.
 * - Self-resolves on reconnect.
 *
 * The tracker observes `ConnectionStatus` changes pushed by the supervisor
 * and does NOT probe on its own.
 */

const DEFAULT_OUTAGE_THRESHOLD_MS = 10 * 60 * 1_000;

export interface OutageEvent {
  environmentId: string;
  since: string;
  durationMs: number;
}

export class OutageTracker {
  private outages = new Map<string, number>();
  private escalated = new Set<string>();
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

  handleStatusChange(environmentId: string, status: ConnectionStatus): void {
    if (this.destroyed) return;

    const isUnreachable = this.isUnreachablePhase(status.phase);

    if (isUnreachable) {
      if (!this.outages.has(environmentId)) {
        this.outages.set(environmentId, Date.now());
        this.scheduleThresholdCheck(environmentId);
      }
    } else {
      const wasEscalated = this.escalated.has(environmentId);
      this.clearTimer(environmentId);
      this.outages.delete(environmentId);
      this.escalated.delete(environmentId);

      if (wasEscalated) {
        this.onResolve(environmentId);
      }
    }
  }

  removeEnvironment(environmentId: string): void {
    this.clearTimer(environmentId);
    this.outages.delete(environmentId);
    this.escalated.delete(environmentId);
  }

  getOutageSince(environmentId: string): number | null {
    return this.outages.get(environmentId) ?? null;
  }

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
