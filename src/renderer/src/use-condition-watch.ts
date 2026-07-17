import { useState, useEffect, useCallback, useRef } from "react";
import { cid, useInject } from "inversify-hooks";
import type { IWatchService, INotificationService } from "./services/interfaces";
import type { ConditionWatch, WatchTarget, WatchCondition } from "../../shared/ipc";
import type { LoopMeta, Environment, EnvironmentHealth } from "./types";
import { standaloneIntl } from "./i18n";

export interface ConditionWatchHookResult {
  watches: ConditionWatch[];
  /** Active (non-tripped) watches keyed by loop ID for quick lookup. */
  watchesByLoop: Map<string, ConditionWatch[]>;
  /** Active (non-tripped) watches keyed by environment ID for quick lookup. */
  watchesByInstance: Map<string, ConditionWatch[]>;
  addWatch: (target: WatchTarget, condition: WatchCondition) => Promise<ConditionWatch>;
  removeWatch: (watchId: string) => Promise<void>;
  disarmWatch: (watchId: string) => Promise<void>;
}

/**
 * Evaluates watch conditions against current loop/instance state,
 * trips matching watches (one-shot), and fires OS notifications.
 */
export function useConditionWatch(
  perEnvLoops: Record<string, LoopMeta[]>,
  perEnvHealth: Record<string, EnvironmentHealth>,
  environments: Environment[],
): ConditionWatchHookResult {
  const [watchService] = useInject<IWatchService>(cid.IWatchService);
  const [notificationService] = useInject<INotificationService>(cid.INotificationService);
  const [watches, setWatches] = useState<ConditionWatch[]>([]);

  // Load watches on mount
  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      const w = await watchService.getWatches();
      if (cancelled) return;
      setWatches(w.filter((x) => !x.tripped));
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [watchService]);

  // Build lookup maps
  const watchesByLoop = new Map<string, ConditionWatch[]>();
  const watchesByInstance = new Map<string, ConditionWatch[]>();
  for (const w of watches) {
    if (w.target.kind === "loop") {
      const key = `${w.target.environmentId}:${w.target.loopId}`;
      const arr = watchesByLoop.get(key) ?? [];
      arr.push(w);
      watchesByLoop.set(key, arr);
    } else {
      const key = w.target.environmentId;
      const arr = watchesByInstance.get(key) ?? [];
      arr.push(w);
      watchesByInstance.set(key, arr);
    }
  }

  // Track already-tripped watch IDs to prevent re-notification
  const trippedIds = useRef<Set<string>>(new Set());

  // Stable ref for notification service
  const notifyRef = useRef(notificationService);
  notifyRef.current = notificationService;

  // Evaluate conditions on every poll cycle
  const prevEvalHash = useRef<string>("");
  useEffect(() => {
    const loopCount = Object.values(perEnvLoops).reduce(
      (sum, loops) => sum + loops.length, 0,
    );
    const evalHash = `${loopCount}:${watches.length}`;
    if (evalHash === prevEvalHash.current) return;
    prevEvalHash.current = evalHash;

    const processWatches = async (): Promise<void> => {
      for (const watch of watches) {
        if (watch.tripped || trippedIds.current.has(watch.id)) continue;

        let tripped = false;
        let trippedMessage = "";

        if (watch.condition.kind === "status-transition") {
          if (watch.target.kind === "loop") {
            const target = watch.target;
            const envLoops = perEnvLoops[target.environmentId] ?? [];
            const loop = envLoops.find((l) => l.id === target.loopId);
            if (loop && loop.status === watch.condition.targetStatus) {
              tripped = true;
              const env = environments.find((e) => e.id === target.environmentId);
              trippedMessage = standaloneIntl.formatMessage(
                { id: "watch.loopStatusTripped" },
                {
                  loopName: loop.description?.trim() || loop.id,
                  status: watch.condition.targetStatus ?? "",
                  envName: env?.name ?? target.environmentId,
                },
              );
            }
          }
        } else if (watch.condition.kind === "reachability-change") {
          if (watch.target.kind === "instance") {
            const health = perEnvHealth[watch.target.environmentId];
            const env = environments.find((e) => e.id === watch.target.environmentId);
            // Trip when instance transitions from ok to offline
            if (health === "offline" || health === "backoff") {
              tripped = true;
              trippedMessage = standaloneIntl.formatMessage(
                { id: "watch.instanceOfflineTripped" },
                { envName: env?.name ?? watch.target.environmentId },
              );
            }
          }
        }

        if (tripped) {
          trippedIds.current.add(watch.id);

          // Mark as tripped in the store (one-shot disarm)
          await watchService.tripWatch(watch.id);

          // Fire OS notification
          const env = environments.find((e) => e.id === watch.target.environmentId);
          const itemId = watch.target.kind === "loop" ? watch.target.loopId : watch.target.environmentId;
          notifyRef.current.sendNotification({
            environmentId: watch.target.environmentId,
            environmentName: env?.name ?? watch.target.environmentId,
            itemId,
            itemType: watch.target.kind,
            status: "watch-tripped",
            message: trippedMessage,
          });
        }
      }

      // Refresh watch list after tripping
      const updated = await watchService.getWatches();
      setWatches(updated.filter((x) => !x.tripped));
    };

    void processWatches();
  }, [watches, perEnvLoops, perEnvHealth, environments, watchService]);

  const addWatch = useCallback(async (target: WatchTarget, condition: WatchCondition): Promise<ConditionWatch> => {
    const newWatch = await watchService.addWatch({ target, condition });
    setWatches((prev) => [...prev, newWatch]);
    return newWatch;
  }, [watchService]);

  const removeWatch = useCallback(async (watchId: string): Promise<void> => {
    await watchService.removeWatch(watchId);
    setWatches((prev) => prev.filter((w) => w.id !== watchId));
  }, [watchService]);

  const disarmWatch = useCallback(async (watchId: string): Promise<void> => {
    await watchService.removeWatch(watchId);
    setWatches((prev) => prev.filter((w) => w.id !== watchId));
  }, [watchService]);

  return {
    watches,
    watchesByLoop,
    watchesByInstance,
    addWatch,
    removeWatch,
    disarmWatch,
  };
}
