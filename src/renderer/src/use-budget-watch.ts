import { useState, useEffect, useCallback, useRef } from "react";
import { cid, useInject } from "inversify-hooks";
import type { IBudgetService } from "./services/interfaces";
import type { BudgetWatch, BudgetBreach } from "../../shared/ipc";
import type { LoopMeta, Environment } from "./types";
import { runsToday } from "./format";

/** Date key for idempotent breach tracking: YYYY-MM-DD. */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface BudgetWatchHookResult {
  watches: BudgetWatch[];
  breaches: BudgetBreach[];
  activeBreaches: BudgetBreach[];
  addWatch: (watch: Omit<BudgetWatch, "id" | "createdAt">) => Promise<BudgetWatch>;
  removeWatch: (watchId: string) => Promise<void>;
  toggleWatch: (watchId: string, enabled: boolean) => Promise<void>;
  dismissBreach: (breachId: string) => Promise<void>;
  resumeLoop: (environmentId: string, loopId: string) => Promise<void>;
}

/**
 * Hook that manages budget watches and breach detection.
 *
 * @param perEnvLoops - Current loop data per environment (from polling).
 * @param environments - Available environments.
 * @param onBreach - Callback when a new breach is detected (for OS notifications).
 */
export function useBudgetWatch(
  perEnvLoops: Record<string, LoopMeta[]>,
  environments: Environment[],
  onBreach?: (breach: BudgetBreach) => void,
): BudgetWatchHookResult {
  const [budgetService] = useInject<IBudgetService>(cid.IBudgetService);
  const [watches, setWatches] = useState<BudgetWatch[]>([]);
  const [breaches, setBreaches] = useState<BudgetBreach[]>([]);

  // Track already-fired breaches today to prevent re-notification
  const firedToday = useRef<Set<string>>(new Set());

  // Load watches and breaches on mount
  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      const [w, b] = await Promise.all([
        budgetService.getWatches(),
        budgetService.getBreaches(),
      ]);
      if (cancelled) return;
      setWatches(w);
      setBreaches(b);
    };
    void load();
    return () => { cancelled = true; };
  }, [budgetService]);

  // Reset fired tracking at midnight
  useEffect(() => {
    const now = new Date();
    const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
    const timer = setTimeout(() => {
      firedToday.current = new Set();
    }, msUntilMidnight);
    return () => clearTimeout(timer);
  }, []);

  // Stable ref for onBreach to avoid re-triggering the effect
  const onBreachRef = useRef(onBreach);
  onBreachRef.current = onBreach;

  // Check watches against current loop data on every poll cycle
  const prevCheckHash = useRef<string>("");
  useEffect(() => {
    const dateKey = todayKey();

    // Only check enabled watches
    const enabledWatches = watches.filter((w) => w.enabled);
    if (enabledWatches.length === 0) return;

    // Simple hash to avoid redundant checks when data hasn't changed
    const loopCount = Object.values(perEnvLoops).reduce(
      (sum, loops) => sum + loops.length, 0,
    );
    const checkHash = `${dateKey}:${loopCount}:${enabledWatches.length}`;
    if (checkHash === prevCheckHash.current) return;
    prevCheckHash.current = checkHash;

    const processWatches = async (): Promise<void> => {
      for (const watch of enabledWatches) {
        if (watch.scope === "loop") {
          // Watch a specific loop
          const envId = watch.environmentId;
          const loopId = watch.loopId;
          if (!envId || !loopId) continue;

          const envLoops = perEnvLoops[envId] ?? [];
          const loop = envLoops.find((l) => l.id === loopId);
          if (!loop) continue;

          const count = runsToday(loop.runHistory);
          const breachKey = `${watch.id}:${loopId}:${dateKey}`;

          if (count > watch.threshold && !firedToday.current.has(breachKey)) {
            firedToday.current.add(breachKey);

            let autoPaused = false;
            if (watch.autoPause) {
              const res = await budgetService.pauseLoop(envId, loopId);
              autoPaused = res.ok;
            }

            const env = environments.find((e) => e.id === envId);
            const newBreach: Omit<BudgetBreach, "id"> = {
              watchId: watch.id,
              loopId,
              environmentId: envId,
              environmentName: env?.name ?? envId,
              loopDescription: loop.description?.trim() || loopId,
              runsToday: count,
              threshold: watch.threshold,
              autoPaused,
              breachedAt: new Date().toISOString(),
              dismissed: false,
            };

            const saved = await budgetService.addBreach(newBreach);
            setBreaches((prev) => [...prev, saved]);
            onBreachRef.current?.(saved);
          }
        } else if (watch.scope === "fleet") {
          // Watch all loops across all environments
          for (const env of environments) {
            const envLoops = perEnvLoops[env.id] ?? [];

            for (const loop of envLoops) {
              const count = runsToday(loop.runHistory);
              const breachKey = `${watch.id}:${loop.id}:${dateKey}`;

              if (count > watch.threshold && !firedToday.current.has(breachKey)) {
                firedToday.current.add(breachKey);

                let autoPaused = false;
                if (watch.autoPause) {
                  const res = await budgetService.pauseLoop(env.id, loop.id);
                  autoPaused = res.ok;
                }

                const newBreach: Omit<BudgetBreach, "id"> = {
                  watchId: watch.id,
                  loopId: loop.id,
                  environmentId: env.id,
                  environmentName: env.name,
                  loopDescription: loop.description?.trim() || loop.id,
                  runsToday: count,
                  threshold: watch.threshold,
                  autoPaused,
                  breachedAt: new Date().toISOString(),
                  dismissed: false,
                };

                const saved = await budgetService.addBreach(newBreach);
                setBreaches((prev) => [...prev, saved]);
                onBreachRef.current?.(saved);
              }
            }
          }
        }
      }
    };

    void processWatches();
  }, [watches, perEnvLoops, environments, budgetService]);

  const addWatch = useCallback(async (watch: Omit<BudgetWatch, "id" | "createdAt">): Promise<BudgetWatch> => {
    const newWatch = await budgetService.addWatch(watch);
    setWatches((prev) => [...prev, newWatch]);
    return newWatch;
  }, [budgetService]);

  const removeWatch = useCallback(async (watchId: string): Promise<void> => {
    await budgetService.removeWatch(watchId);
    setWatches((prev) => prev.filter((w) => w.id !== watchId));
  }, [budgetService]);

  const toggleWatch = useCallback(async (watchId: string, enabled: boolean): Promise<void> => {
    await budgetService.updateWatch(watchId, { enabled });
    setWatches((prev) => prev.map((w) => w.id === watchId ? { ...w, enabled } : w));
  }, [budgetService]);

  const dismissBreach = useCallback(async (breachId: string): Promise<void> => {
    await budgetService.dismissBreach(breachId);
    setBreaches((prev) => prev.map((b) => b.id === breachId ? { ...b, dismissed: true } : b));
  }, [budgetService]);

  const resumeLoop = useCallback(async (environmentId: string, loopId: string): Promise<void> => {
    await budgetService.resumeLoop(environmentId, loopId);
  }, [budgetService]);

  const activeBreaches = breaches.filter((b) => !b.dismissed);

  return {
    watches,
    breaches,
    activeBreaches,
    addWatch,
    removeWatch,
    toggleWatch,
    dismissBreach,
    resumeLoop,
  };
}
