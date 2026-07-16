import { injectable } from "inversify-hooks";
import type { InfraActionArgs, InfraActionResult } from "../../../../shared/ipc";
import type { IInfraService } from "../interfaces";

@injectable()
export class InfraService implements IInfraService {
  private get api() {
    return window.api!.infra;
  }

  async executeAction(args: InfraActionArgs): Promise<InfraActionResult> {
    return this.api.executeAction(args);
  }
  async getStatus(): Promise<{ mainVmId: string | null; connected: boolean }> {
    return this.api.getStatus();
  }
}
