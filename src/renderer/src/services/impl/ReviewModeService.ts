import { injectable } from "inversify-hooks";
import { cid, container } from "inversify-hooks";
import type { IReviewModeService, IInfraService, IInboxService } from "../interfaces";
import type { ReviewModeItem, InfraActionResult, InboxItem, InboxItemResolutionReason, BatchOverlapResult, PrOverlap, GetPrDiffResult, DiffFileEntry, PrRiskLevel } from "../../../../shared/ipc";
import { kindToNotificationType } from "../../../../shared/ipc";
import { detectBatchOverlaps, type PrFileSet } from "../../features/review/detect-overlaps";

@injectable()
export class ReviewModeService implements IReviewModeService {
  private batchItems: ReviewModeItem[] = [];
  private activeItem: ReviewModeItem | null = null;
  private disposedPrs = new Set<string>();
  private listeners = new Set<(item: ReviewModeItem | null) => void>();
  private overlapResult: BatchOverlapResult | null = null;
  private overlapListeners = new Set<(result: BatchOverlapResult | null) => void>();
  private diffFileCache = new Map<string, DiffFileEntry[]>();

  private getInfraService(): IInfraService {
    return container.get<IInfraService>(cid.IInfraService as unknown as string);
  }

  private getInboxService(): IInboxService {
    return container.get<IInboxService>(cid.IInboxService as unknown as string);
  }

  enter(item: ReviewModeItem): void {
    this.enterBatch([item], 0);
  }

  enterBatch(items: ReviewModeItem[], selectedIndex?: number): void {
    this.batchItems = items;
    this.disposedPrs.clear();
    this.diffFileCache.clear();
    this.overlapResult = null;
    const idx = selectedIndex ?? 0;
    this.activeItem = items[Math.min(idx, items.length - 1)] ?? null;
    for (const cb of this.listeners) {
      cb(this.activeItem);
    }
    // Trigger async overlap analysis
    void this.computeOverlaps(items);
  }

  exit(): void {
    this.batchItems = [];
    this.activeItem = null;
    this.disposedPrs.clear();
    this.diffFileCache.clear();
    this.overlapResult = null;
    for (const cb of this.listeners) {
      cb(null);
    }
    for (const cb of this.overlapListeners) {
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

  getOverlapResult(): BatchOverlapResult | null {
    return this.overlapResult;
  }

  onOverlapUpdate(cb: (result: BatchOverlapResult | null) => void): () => void {
    this.overlapListeners.add(cb);
    return () => {
      this.overlapListeners.delete(cb);
    };
  }

  /** Get cached file entries for a PR (populated during overlap analysis). */
  getCachedDiffFiles(repo: string, number: number): DiffFileEntry[] | undefined {
    return this.diffFileCache.get(`${repo}:${number}`);
  }

  private async computeOverlaps(items: ReviewModeItem[]): Promise<void> {
    if (items.length <= 1) {
      // No overlaps possible with a single PR
      this.overlapResult = {
        overlaps: [],
        suggestedOrder: [],
        perPrNotes: new Map(),
      };
      for (const cb of this.overlapListeners) {
        cb(this.overlapResult);
      }
      return;
    }

    const infraService = this.getInfraService();

    // Fetch diff file lists for all PRs in the batch
    const prFileSets: PrFileSet[] = [];

    for (const item of items) {
      const key = `${item.repo}:${item.number}`;
      try {
        const result: InfraActionResult = await infraService.executeAction({
          action: "get-pr-diff",
          params: { repo: item.repo, number: item.number },
        });

        if (result.ok && result.data) {
          const diffResult = result.data as GetPrDiffResult;
          this.diffFileCache.set(key, diffResult.files);

          const filePaths = new Set(diffResult.files.map((f) => f.path));
          const filesWithAdditions = new Set(
            diffResult.files
              .filter((f) => f.additions > 0)
              .map((f) => f.path),
          );

          prFileSets.push({
            key,
            number: item.number,
            filePaths,
            filesWithAdditions,
            riskLevel: item.verdict?.riskLevel ?? "uncertain",
          });
        } else {
          // Fallback: empty file set (will not show overlaps)
          prFileSets.push({
            key,
            number: item.number,
            filePaths: new Set(),
            filesWithAdditions: new Set(),
            riskLevel: item.verdict?.riskLevel ?? "uncertain",
          });
        }
      } catch {
        // On error, add empty entry — this PR won't show overlaps
        prFileSets.push({
          key,
          number: item.number,
          filePaths: new Set(),
          filesWithAdditions: new Set(),
          riskLevel: item.verdict?.riskLevel ?? "uncertain",
        });
      }
    }

    // Run the overlap detection algorithm
    this.overlapResult = detectBatchOverlaps(prFileSets);

    for (const cb of this.overlapListeners) {
      cb(this.overlapResult);
    }
  }
}
