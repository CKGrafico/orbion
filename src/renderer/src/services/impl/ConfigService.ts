import { injectable } from "inversify-hooks";
import type {
  Environment,
  AccessEndpoint,
  EndpointKind,
  SessionScope,
  PairingCodeExchangeResponse,
  OpenCodeEndpoint,
  SetOpenCodeEndpointResult,
} from "../../../../shared/ipc";
import type { IConfigService } from "../interfaces";

@injectable()
export class ConfigService implements IConfigService {
  private get api() {
    return window.api!.config;
  }

  async getEnvironments(): Promise<Environment[]> {
    return this.api.getEnvironments();
  }
  async addEnvironment(name: string, url: string, kind?: EndpointKind): Promise<Environment> {
    return this.api.addEnvironment(name, url, kind);
  }
  async removeEnvironment(id: string): Promise<void> {
    return this.api.removeEnvironment(id);
  }
  async addEndpoint(environmentId: string, url: string, kind: EndpointKind): Promise<AccessEndpoint | null> {
    return this.api.addEndpoint(environmentId, url, kind);
  }
  async removeEndpoint(environmentId: string, endpointId: string): Promise<void> {
    return this.api.removeEndpoint(environmentId, endpointId);
  }
  async setActiveEndpoint(environmentId: string, endpointId: string): Promise<void> {
    return this.api.setActiveEndpoint(environmentId, endpointId);
  }
  async getSelectedEnvironmentId(): Promise<string | null> {
    return this.api.getSelectedEnvironmentId();
  }
  async setSelectedEnvironmentId(id: string | null): Promise<void> {
    return this.api.setSelectedEnvironmentId(id);
  }
  async migrateFromLocalStorage(rawInstances: string, rawSelectedId: string | null): Promise<boolean> {
    return this.api.migrateFromLocalStorage(rawInstances, rawSelectedId);
  }
  async exchangePairingCode(baseUrl: string, code: string, scope?: SessionScope): Promise<PairingCodeExchangeResponse> {
    return this.api.exchangePairingCode(baseUrl, code, scope);
  }
  async removeSessionToken(environmentId: string): Promise<void> {
    return this.api.removeSessionToken(environmentId);
  }
  async setOpenCodeEndpoint(environmentId: string, endpoint: OpenCodeEndpoint | null): Promise<SetOpenCodeEndpointResult> {
    return this.api.setOpenCodeEndpoint(environmentId, endpoint);
  }
  async setMainVm(environmentId: string): Promise<void> {
    return this.api.setMainVm(environmentId);
  }
  async getMainVmId(): Promise<string | null> {
    return this.api.getMainVmId();
  }
}
