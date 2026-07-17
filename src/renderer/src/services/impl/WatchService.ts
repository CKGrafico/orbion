import { injectable } from "inversify-hooks";
import type { IWatchService } from "../interfaces";
import type { ConditionWatch } from "../../../../shared/ipc";

@injectable()
export class WatchService implements IWatchService {
  async getWatches(): Promise<ConditionWatch[]> {
    if (!window.api) return [];
    return window.api.watch.getWatches();
  }

  async addWatch(watch: Omit<ConditionWatch, "id" | "createdAt" | "tripped" | "trippedAt">): Promise<ConditionWatch> {
    if (!window.api) throw new Error("WatchService: no window.api");
    return window.api.watch.addWatch(watch);
  }

  async removeWatch(watchId: string): Promise<void> {
    if (!window.api) throw new Error("WatchService: no window.api");
    return window.api.watch.removeWatch(watchId);
  }

  async tripWatch(watchId: string): Promise<void> {
    if (!window.api) throw new Error("WatchService: no window.api");
    return window.api.watch.tripWatch(watchId);
  }

  async getWatchesForLoop(environmentId: string, loopId: string): Promise<ConditionWatch[]> {
    const all = await this.getWatches();
    return all.filter((w) => {
      if (w.tripped) return false;
      if (w.target.kind !== "loop") return false;
      return w.target.environmentId === environmentId && w.target.loopId === loopId;
    });
  }

  async getWatchesForInstance(environmentId: string): Promise<ConditionWatch[]> {
    const all = await this.getWatches();
    return all.filter((w) => {
      if (w.tripped) return false;
      if (w.target.kind !== "instance") return false;
      return w.target.environmentId === environmentId;
    });
  }
}
