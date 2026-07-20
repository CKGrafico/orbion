import { injectable } from "inversify-hooks";
import type { LoopShape } from "../../../../shared/ipc";
import type { ILoopShapeCacheService } from "../interfaces";

@injectable()
export class LoopShapeCacheService implements ILoopShapeCacheService {
  async getCached(environmentId: string): Promise<LoopShape[]> {
    return window.api!.loopShapeCache.getCached(environmentId);
  }

  async getAll(): Promise<LoopShape[]> {
    return window.api!.loopShapeCache.getAll();
  }

  async refresh(environmentId: string): Promise<LoopShape[]> {
    return window.api!.loopShapeCache.refresh(environmentId);
  }

  onUpdate(cb: (shapes: LoopShape[]) => void): () => void {
    return window.api!.loopShapeCache.onUpdate(cb);
  }
}
