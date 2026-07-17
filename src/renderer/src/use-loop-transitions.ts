import { useEffect, useRef } from "react";
import type { LoopMeta } from "./types";

export interface LoopTransition {
  environmentId: string;
  loopId: string;
  loopDescription: string;
  fromStatus: string;
  toStatus: string;
  lastExitCode: number | null;
  maxRuns: number | null;
  runCount: number;
  projectId?: string;
}

interface LoopSnapshot {
  status: string;
  lastExitCode: number | null;
  maxRuns: number | null;
  runCount: number;
  description?: string;
  projectId?: string;
}

/**
 * Hook that detects loop state transitions between poll cycles.
 *
 * Compares the previous per-loop snapshot to the current one and fires
 * the given callback for each newly-observed failure or finishing event.
 *
 * On first load (no previous snapshot), transitions are NOT emitted, to
 * avoid flooding the inbox with items for loops that were already
 * failed/finished when the app started. The InboxService handles those
 * via its normal derivation.
 */
export function useLoopTransitions(
  perEnvLoops: Record<string, LoopMeta[]>,
  onTransition: (transition: LoopTransition) => void,
): void {
  const prevSnapshots = useRef<Record<string, LoopSnapshot>>({});
  const initialized = useRef(false);
  const onTransitionRef = useRef(onTransition);
  onTransitionRef.current = onTransition;

  useEffect(() => {
    const currentSnapshots: Record<string, LoopSnapshot> = {};

    for (const [envId, loops] of Object.entries(perEnvLoops)) {
      for (const loop of loops) {
        const key = `${envId}:${loop.id}`;
        currentSnapshots[key] = {
          status: loop.status,
          lastExitCode: loop.lastExitCode,
          maxRuns: loop.maxRuns,
          runCount: loop.runCount,
          description: loop.description,
          projectId: loop.projectId,
        };

        if (!initialized.current) continue;

        const prev = prevSnapshots.current[key];
        if (!prev) continue;

        const isNowFailed = loop.lastExitCode !== null && loop.lastExitCode !== 0;
        const isNowFinished = loop.maxRuns !== null && loop.runCount >= loop.maxRuns;

        const wasFailed = prev.lastExitCode !== null && prev.lastExitCode !== 0;
        const wasFinished = prev.maxRuns !== null && prev.runCount >= prev.maxRuns;

        // Finished takes precedence: a loop that hit max-runs is "finished"
        // even if its last exit was non-zero. This matches the inbox derivation
        // where finished-loop > failed-loop when both apply.
        if (isNowFinished && !wasFinished) {
          onTransitionRef.current({
            environmentId: envId,
            loopId: loop.id,
            loopDescription: loop.description?.trim() || loop.id,
            fromStatus: prev.status,
            toStatus: loop.status,
            lastExitCode: loop.lastExitCode,
            maxRuns: loop.maxRuns,
            runCount: loop.runCount,
            projectId: loop.projectId,
          });
        } else if (isNowFailed && !wasFailed) {
          // Failure transition: loop became failed (was not failed before, and not finished)
          onTransitionRef.current({
            environmentId: envId,
            loopId: loop.id,
            loopDescription: loop.description?.trim() || loop.id,
            fromStatus: prev.status,
            toStatus: loop.status,
            lastExitCode: loop.lastExitCode,
            maxRuns: loop.maxRuns,
            runCount: loop.runCount,
            projectId: loop.projectId,
          });
        }
      }
    }

    prevSnapshots.current = currentSnapshots;
    initialized.current = true;
  }, [perEnvLoops]);
}
