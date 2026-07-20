import type { IReviewModeService } from "../interfaces";
import type { ReviewModeItem } from "../../../../shared/ipc";

export class ReviewModeService implements IReviewModeService {
  private batchItems: ReviewModeItem[] = [];
  private activeItem: ReviewModeItem | null = null;
  private disposedPrs = new Set<string>();
  private listeners = new Set<(item: ReviewModeItem | null) => void>();

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

  onStateChange(cb: (item: ReviewModeItem | null) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
}
