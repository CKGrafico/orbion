import { injectable } from "inversify-hooks";
import type {
  Environment,
  AccessEndpoint,
  EndpointKind,
  SessionScope,
  PairingCodeExchangeResponse,
  OpenCodeEndpoint,
  SetOpenCodeEndpointResult,
  ChatSession,
  BootstrapSeedExportResult,
  BootstrapSeedImportResult,
  RestoreAvailability,
  PullRestoreResult,
  ConfigStamp,
  StampCheckedWriteResult,
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
  async getProjectPickupLabels(projectId: string): Promise<string[]> {
    return this.api.getProjectPickupLabels(projectId);
  }
  async setProjectPickupLabels(projectId: string, labels: string[]): Promise<void> {
    return this.api.setProjectPickupLabels(projectId, labels);
  }
  async getChatSessions(): Promise<ChatSession[]> {
    return this.api.getChatSessions();
  }
  async addChatSession(session: Omit<ChatSession, "id" | "createdAt">): Promise<ChatSession> {
    return this.api.addChatSession(session);
  }
  async removeChatSession(sessionId: string): Promise<void> {
    return this.api.removeChatSession(sessionId);
  }
  async updateChatSession(sessionId: string, updates: Partial<Pick<ChatSession, "title" | "lastActiveAt" | "environmentId" | "workingDirectory" | "activeRuntime" | "activeModel" | "reasoningEffort">>): Promise<void> {
    return this.api.updateChatSession(sessionId, updates);
  }
  async getExpandedProjects(): Promise<string[]> {
    return this.api.getExpandedProjects();
  }
  async setExpandedProjects(expandedKeys: string[]): Promise<void> {
    return this.api.setExpandedProjects(expandedKeys);
  }
  async exportBootstrapSeed(): Promise<BootstrapSeedExportResult> {
    return this.api.exportBootstrapSeed();
  }
  async importBootstrapSeed(seedString: string): Promise<BootstrapSeedImportResult> {
    return this.api.importBootstrapSeed(seedString);
  }
  async checkRestoreAvailable(): Promise<RestoreAvailability> {
    return this.api.checkRestoreAvailable();
  }
  async pullRestore(): Promise<PullRestoreResult> {
    return this.api.pullRestore();
  }
  async getConfigStamp(): Promise<ConfigStamp> {
    return this.api.getConfigStamp();
  }
  async stampCheckedSetMainVm(environmentId: string, knownStamp: ConfigStamp): Promise<StampCheckedWriteResult> {
    return this.api.stampCheckedSetMainVm(environmentId, knownStamp);
  }
  async forceSetMainVm(environmentId: string): Promise<ConfigStamp> {
    return this.api.forceSetMainVm(environmentId);
  }
}
