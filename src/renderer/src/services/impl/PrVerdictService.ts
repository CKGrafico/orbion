import { injectable } from "inversify-hooks";
import type { IPrVerdictService, IInfraService } from "../interfaces";
import type { PrVerdict, PrAwaitingReviewItem, GetPrVerdictResult } from "../../../../shared/ipc";
import { cid, container } from "inversify-hooks";

const FETCH_DELAY_MS = 500;

interface CachedVerdict {
  verdict: PrVerdict;
  headSha: string;
}

@injectable()
export class PrVerdictService implements IPrVerdictService {
  private cache = new Map<string, CachedVerdict>();
  private listeners: Array<() => void> = [];
  private fetchQueue: Array<{ repo: string; number: number; headSha: string }> = [];
  private isFetching = false;

  private getInfraService(): IInfraService {
    return container.resolve<IInfraService>(cid.IInfraService as unknown as string);
  }

  private static cacheKey(repo: string, number: number): string {
    return `${repo}:${number}`;
  }

  getVerdict(repo: string, number: number): PrVerdict | undefined {
    return this.cache.get(PrVerdictService.cacheKey(repo, number))?.verdict;
  }

  async fetchVerdict(repo: string, number: number): Promise<PrVerdict | undefined> {
    try {
      const result = await this.getInfraService().executeAction({
        action: "get-pr-verdict",
        params: { repo, number },
      });

      if (result.ok && result.data) {
        const prResult = result.data as GetPrVerdictResult;
        this.cache.set(PrVerdictService.cacheKey(repo, number), {
          verdict: prResult.verdict,
          headSha: "", // We don't know headSha from this call alone
        });
        this.notifyListeners();
        return prResult.verdict;
      }
    } catch {
      // Silently ignore; will retry on next sync
    }
    return undefined;
  }

  syncVerdicts(prs: PrAwaitingReviewItem[]): void {
    const needed: Array<{ repo: string; number: number; headSha: string }> = [];

    for (const pr of prs) {
      const key = PrVerdictService.cacheKey(pr.repo, pr.number);
      const cached = this.cache.get(key);

      // Need to fetch if: no cache entry, or headSha changed
      if (!cached || cached.headSha !== pr.headSha) {
        needed.push({ repo: pr.repo, number: pr.number, headSha: pr.headSha });
      }
    }

    if (needed.length === 0) return;

    // Enqueue items that aren't already queued
    for (const item of needed) {
      const alreadyQueued = this.fetchQueue.some(
        (q) => q.repo === item.repo && q.number === item.number,
      );
      if (!alreadyQueued) {
        this.fetchQueue.push(item);
      }
    }

    void this.processQueue();
  }

  onVerdictsUpdate(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isFetching) return;
    this.isFetching = true;

    try {
      while (this.fetchQueue.length > 0) {
        const item = this.fetchQueue.shift()!;
        const result = await this.getInfraService().executeAction({
          action: "get-pr-verdict",
          params: { repo: item.repo, number: item.number },
        });

        if (result.ok && result.data) {
          const prResult = result.data as GetPrVerdictResult;
          this.cache.set(PrVerdictService.cacheKey(item.repo, item.number), {
            verdict: prResult.verdict,
            headSha: item.headSha,
          });
          this.notifyListeners();
        }

        // Small delay between requests to avoid rate-limiting
        if (this.fetchQueue.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, FETCH_DELAY_MS));
        }
      }
    } catch {
      // Stop processing on unexpected errors; next sync will retry
    } finally {
      this.isFetching = false;
    }
  }
}
