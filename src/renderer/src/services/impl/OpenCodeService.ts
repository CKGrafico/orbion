import { injectable } from "inversify-hooks";
import type { OpenCodeConnectionStatus } from "../../../../shared/ipc";
import type { IOpenCodeService } from "../interfaces";

@injectable()
export class OpenCodeService implements IOpenCodeService {
  private get api() {
    return window.api!.opencode;
  }

  async getStatus(environmentId: string): Promise<OpenCodeConnectionStatus> {
    return this.api.getStatus(environmentId);
  }
  async refreshStatus(environmentId: string): Promise<OpenCodeConnectionStatus> {
    return this.api.refreshStatus(environmentId);
  }
  onStatusChange(cb: (environmentId: string, status: OpenCodeConnectionStatus) => void): () => void {
    return this.api.onStatusChange(cb);
  }
}
