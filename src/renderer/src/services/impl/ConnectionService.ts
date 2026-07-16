import { injectable } from "inversify-hooks";
import type { ConnectionStatus, EndpointHealth } from "../../../../shared/ipc";
import type { IConnectionService } from "../interfaces";

@injectable()
export class ConnectionService implements IConnectionService {
  private get api() {
    return window.api!.connection;
  }

  async getStatus(environmentId: string): Promise<ConnectionStatus | null> {
    return this.api.getStatus(environmentId);
  }
  async getEndpointHealth(environmentId: string): Promise<EndpointHealth[]> {
    return this.api.getEndpointHealth(environmentId);
  }
  async retry(environmentId: string): Promise<void> {
    return this.api.retry(environmentId);
  }
  onStatusChange(cb: (environmentId: string, status: ConnectionStatus) => void): () => void {
    return this.api.onStatusChange(cb);
  }
  onEndpointHealthChange(cb: (environmentId: string, health: EndpointHealth[]) => void): () => void {
    return this.api.onEndpointHealthChange(cb);
  }
  notifyNetworkChanged(online: boolean): void {
    return this.api.notifyNetworkChanged(online);
  }
}
