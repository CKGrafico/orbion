import { injectable } from "inversify-hooks";
import { cid, container } from "inversify-hooks";
import type { IReviewModeService, IInfraService, IInboxService } from "../interfaces";
import type { ReviewModeItem, InfraActionResult, InboxItem, InboxItemResolutionReason } from "../../../../shared/ipc";
import { kindToNotificationType } from "../../../../shared/ipc";

@injectable()
export class ReviewModeService implements IReviewModeService {
  private batchItems: ReviewModeItem[] = [];
  private activeItem: ReviewModeItem | null = null;
  private disposedPrs = new Set<string>();
  private listeners = new Set<(item: ReviewModeItem | null) => void>();

  private getInfraService(): IInfraService {
    return container.resolve<IInfraService>(cid.IInfraService as unknown as string);
  }

  private getInboxService(): IInboxService {
    return container.resolve<IInboxService>(cid.IInboxService as unknown as string);
  }

  enter(item: ReviewModeItem): void {
    this.enterBatch([item], 0);
  }

  enterBatch(items: ReviewModeItem[], selectedIndex?: number): void {
    this.batchItems = items;
    this.disposedPrs.clear();
    const idx = selectedIndex ?? 0;
    this.activeItem = items[Math.min(idx, items.length - 1)] ?? null;
    for (const cb of this.listeners) {
      cb(this.activeItem);
    }
  }

  exit(): void {
    this.batchItems = [];
    this.activeItem = null;
    this.disposedPrs.clear();
    for (const cb of this.listeners) {
      cb(null);
    }
  }

  getActiveItem(): ReviewModeItem | null {
    return this.activeItem;
  }

  getBatchItems(): ReviewModeItem[] {
    return this.batchItems;
  }

  markDisposed(repo: string, number: number): void {
    this.disposedPrs.add(`${repo}:${number}`);
    for (const cb of this.listeners) {
      cb(this.activeItem);
    }
  }

  getDisposedPrs(): Set<string> {
    return new Set(this.disposedPrs);
  }

  async submitReview(params: { repo: string; number: number; event: "APPROVE" | "REQUEST_CHANGES"; body?: string }): Promise<{ ok: boolean; error?: string }> {
    const infraService = this.getInfraService();

    const result: InfraActionResult = await infraService.executeAction({
      action: "submit-pr-review",
      params,
    });

    if (!result.ok) {
      const error = typeof result.error === "string"
        ? result.error
        : result.error?.key ?? "Failed to submit review";
      return { ok: false, error };
    }

    // Mark as disposed in the review queue
    this.markDisposed(params.repo, params.number);

    // Resolve the corresponding inbox item
    const inboxService = this.getInboxService();
    const itemId = `pr-awaiting-review:${params.repo}:${params.number}`;
    const resolvedItem: InboxItem = {
      id: itemId,
      kind: "pr-awaiting-review",
      notificationType: kindToNotificationType("pr-awaiting-review"),
      environmentId: "",
      environmentName: "",
      title: `#${params.number}`,
      occurredAt: new Date().toISOString(),
      dismissed: false,
      availableActions: [],
      prNumber: params.number,
      prRepo: params.repo,
      prUrl: "",
    };

    void inboxService.resolveItem({
      item: resolvedItem,
      resolvedAt: new Date().toISOString(),
      resolution: "pr-resolved" as InboxItemResolutionReason,
    });

    return { ok: true };
  }

  openOnWeb(url: string): void {
    const infraService = this.getInfraService();
    void infraService.executeAction({
      action: "open-pr-in-browser",
      params: { url },
    });
  }

  onStateChange(cb: (item: ReviewModeItem | null) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
}
