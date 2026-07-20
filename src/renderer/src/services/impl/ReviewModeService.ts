import type { IReviewModeService } from "../interfaces";
import type { ReviewModeItem } from "../../../../shared/ipc";

export class ReviewModeService implements IReviewModeService {
  private activeItem: ReviewModeItem | null = null;
  private listeners = new Set<(item: ReviewModeItem | null) => void>();

  enter(item: ReviewModeItem): void {
    this.activeItem = item;
    for (const cb of this.listeners) {
      cb(item);
    }
  }

  exit(): void {
    this.activeItem = null;
    for (const cb of this.listeners) {
      cb(null);
    }
  }

  getActiveItem(): ReviewModeItem | null {
    return this.activeItem;
  }

  onStateChange(cb: (item: ReviewModeItem | null) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
}
