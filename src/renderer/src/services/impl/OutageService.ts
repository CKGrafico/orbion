import { injectable } from "inversify-hooks";
import type { OutageEscalation } from "../../../../shared/ipc";
import type { IOutageService } from "../interfaces";

@injectable()
export class OutageService implements IOutageService {
  private get api() {
    return window.api!.outage;
  }

  async getEscalations(): Promise<OutageEscalation[]> {
    return this.api.getEscalations();
  }

  onEscalation(cb: (event: OutageEscalation) => void): () => void {
    return this.api.onEscalation(cb);
  }

  onResolve(cb: (environmentId: string) => void): () => void {
    return this.api.onResolve(cb);
  }
}
