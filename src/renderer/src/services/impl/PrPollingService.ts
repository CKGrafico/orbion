import { injectable } from "inversify-hooks";
import type { IPrPollingService, IInfraService, IConfigService } from "../interfaces";
import type { PrAwaitingReviewItem, ListPrsAwaitingReviewResult } from "../../../../shared/ipc";
import { cid, container } from "inversify-hooks";

const POLL_INTERVAL_MS = 60_000;

@injectable()
export class PrPollingService implements IPrPollingService {
  private prs: PrAwaitingReviewItem[] = [];
  private listeners: ((prs: PrAwaitingReviewItem[]) => void)[] = [];
  private timerId: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;

  private getConfigService(): IConfigService {
    return container.resolve<IConfigService>(cid.IConfigService as unknown as string);
  }

  private getInfraService(): IInfraService {
    return container.resolve<IInfraService>(cid.IInfraService as unknown as string);
  }

  startPolling(): void {
    if (this.timerId !== null) return; // already started

    // Initial fetch immediately
    void this.fetchPrs();

    this.timerId = setInterval(() => {
      void this.fetchPrs();
    }, POLL_INTERVAL_MS);
  }

  stopPolling(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  getPrs(): PrAwaitingReviewItem[] {
    return this.prs;
  }

  onPrsUpdate(cb: (prs: PrAwaitingReviewItem[]) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private async fetchPrs(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      // Only poll if the main VM is connected
      const status = await this.getInfraService().getStatus();
      if (!status.connected) {
        return;
      }

      const result = await this.getInfraService().executeAction({
        action: "list-prs-awaiting-review",
        params: {},
      });

      if (result.ok && result.data) {
        const prResult = result.data as ListPrsAwaitingReviewResult;
        this.prs = prResult.prs;
      } else {
        // On error (CLI not found, not authenticated, etc.), don't clear existing data
        // The next poll will retry
        return;
      }
    } catch {
      // Silently ignore errors; next poll will retry
      return;
    } finally {
      this.isPolling = false;
    }

    // Notify listeners
    for (const listener of this.listeners) {
      listener(this.prs);
    }
  }
}
