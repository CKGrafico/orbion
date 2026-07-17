import { injectable } from "inversify-hooks";
import type { IBudgetService, IApiService, IConfigService } from "../interfaces";
import type { BudgetWatch, BudgetBreach, ApiResponse } from "../../../../shared/ipc";
import { cid, container } from "inversify-hooks";

@injectable()
export class BudgetService implements IBudgetService {
  private getConfigService(): IConfigService {
    return container.resolve<IConfigService>(cid.IConfigService as unknown as string);
  }

  private getApiService(): IApiService {
    return container.resolve<IApiService>(cid.IApiService as unknown as string);
  }

  private resolveBaseUrl(environmentId: string): Promise<string> {
    return this.getConfigService().getEnvironments().then((envs) => {
      const env = envs.find((e) => e.id === environmentId);
      if (!env) return "";
      if (env.activeEndpointId) {
        const ep = env.endpoints.find((e) => e.id === env.activeEndpointId);
        if (ep) return ep.url;
      }
      return env.endpoints.length > 0 ? env.endpoints[0].url : "";
    });
  }

  async getWatches(): Promise<BudgetWatch[]> {
    if (!window.api) return [];
    return window.api.budget.getWatches();
  }

  async addWatch(watch: Omit<BudgetWatch, "id" | "createdAt">): Promise<BudgetWatch> {
    if (!window.api) throw new Error("BudgetService: no window.api");
    return window.api.budget.addWatch(watch);
  }

  async removeWatch(watchId: string): Promise<void> {
    if (!window.api) throw new Error("BudgetService: no window.api");
    return window.api.budget.removeWatch(watchId);
  }

  async updateWatch(watchId: string, updates: Partial<Pick<BudgetWatch, "threshold" | "autoPause" | "enabled">>): Promise<void> {
    if (!window.api) throw new Error("BudgetService: no window.api");
    return window.api.budget.updateWatch(watchId, updates);
  }

  async getBreaches(): Promise<BudgetBreach[]> {
    if (!window.api) return [];
    return window.api.budget.getBreaches();
  }

  async addBreach(breach: Omit<BudgetBreach, "id">): Promise<BudgetBreach> {
    if (!window.api) throw new Error("BudgetService: no window.api");
    return window.api.budget.addBreach(breach);
  }

  async dismissBreach(breachId: string): Promise<void> {
    if (!window.api) throw new Error("BudgetService: no window.api");
    return window.api.budget.dismissBreach(breachId);
  }

  async pauseLoop(environmentId: string, loopId: string): Promise<ApiResponse> {
    const baseUrl = await this.resolveBaseUrl(environmentId);
    if (!baseUrl) return { ok: false, status: 0, error: "Environment not found" };
    return this.getApiService().request({
      baseUrl,
      path: `/api/loops/${encodeURIComponent(loopId)}/pause`,
      method: "POST",
    });
  }

  async resumeLoop(environmentId: string, loopId: string): Promise<ApiResponse> {
    const baseUrl = await this.resolveBaseUrl(environmentId);
    if (!baseUrl) return { ok: false, status: 0, error: "Environment not found" };
    return this.getApiService().request({
      baseUrl,
      path: `/api/loops/${encodeURIComponent(loopId)}/resume`,
      method: "POST",
    });
  }
}
