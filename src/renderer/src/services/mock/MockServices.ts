import { injectable } from "inversify-hooks";
import type {
  Environment,
  AccessEndpoint,
  EndpointKind,
  ApiResponse,
  ConnectionStatus,
  EndpointHealth,
  OpenCodeConnectionStatus,
  TailscalePeersResponse,
  InfraActionArgs,
  InfraActionResult,
  ApiRequestArgs,
  StreamSubscribeArgs,
  StreamEventPayload,
  PairingCodeExchangeResponse,
  OpenCodeEndpoint,
  SessionScope,
  SetOpenCodeEndpointResult,
  PlatformType,
} from "../../../../shared/ipc";
import type { LoopMeta, Project, TaskDefinition } from "../../types";
import type {
  IConfigService,
  IConnectionService,
  IOpenCodeService,
  IVmWizardService,
  IInfraService,
  IApiService,
  IStreamService,
  ITailscaleService,
  INotificationService,
} from "../interfaces";

const now = Date.now();
const iso = (offsetMs: number): string => new Date(now + offsetMs).toISOString();

const MOCK_PROJECTS: Project[] = [
  { id: "default", name: "Default", color: "#ffffff", createdAt: iso(-86400000 * 12), isSystem: true },
  { id: "etl", name: "ETL", color: "#34d399", createdAt: iso(-86400000 * 3) },
  { id: "agents", name: "Agents", color: "#a78bfa", createdAt: iso(-86400000 * 2) },
];

function mockLoop(partial: Partial<LoopMeta> & Pick<LoopMeta, "id" | "status" | "command">): LoopMeta {
  return { description: undefined, commandArgs: [], cwd: "/home/user/project", intervalHuman: "30m", maxRuns: null, runCount: 0, skippedCount: 0, lastExitCode: null, lastRunAt: null, nextRunAt: null, pid: null, projectId: "default", runHistory: [], createdAt: iso(-3600000), ...partial };
}

const MOCK_LOOPS: LoopMeta[] = [
  mockLoop({ id: "loop-1", status: "running", command: "npm run build", intervalHuman: "5m", runCount: 142, lastExitCode: 0, lastRunAt: iso(-300000), nextRunAt: iso(300000), pid: 12345, runHistory: [
    { runNumber: 142, startedAt: iso(-300000), exitCode: 0, duration: 4500, logSize: 1024, status: "completed", logOffset: 0 },
    { runNumber: 141, startedAt: iso(-600000), exitCode: 0, duration: 4200, logSize: 980, status: "completed", logOffset: 0 },
    { runNumber: 140, startedAt: iso(-900000), exitCode: 1, duration: 1200, logSize: 512, status: "completed", logOffset: 0 },
    { runNumber: 139, startedAt: iso(-1200000), exitCode: 0, duration: 4600, logSize: 1040, status: "completed", logOffset: 0 },
    { runNumber: 138, startedAt: iso(-1500000), exitCode: 0, duration: 4300, logSize: 990, status: "completed", logOffset: 0 },
    { runNumber: 137, startedAt: iso(-1800000), exitCode: 0, duration: 4100, logSize: 960, status: "completed", logOffset: 0 },
  ] }),
  mockLoop({ id: "loop-2", status: "waiting", command: "pnpm test", intervalHuman: "10m", runCount: 88, lastExitCode: 0, lastRunAt: iso(-600000), nextRunAt: iso(400000), runHistory: [
    { runNumber: 88, startedAt: iso(-600000), exitCode: 0, duration: 3200, logSize: 768, status: "completed", logOffset: 0 },
    { runNumber: 87, startedAt: iso(-1200000), exitCode: 0, duration: 2800, logSize: 720, status: "completed", logOffset: 0 },
    { runNumber: 86, startedAt: iso(-1800000), exitCode: 0, duration: 3100, logSize: 740, status: "completed", logOffset: 0 },
  ] }),
  mockLoop({ id: "loop-3", status: "stopped", command: "docker compose up", intervalHuman: "1h", runCount: 12, lastExitCode: 1, lastRunAt: iso(-7200000), runHistory: [
    { runNumber: 12, startedAt: iso(-7200000), exitCode: 1, duration: 5400, logSize: 2048, status: "completed", logOffset: 0 },
  ] }),
  mockLoop({ id: "loop-4", status: "running", command: "opencode agent run", description: "AI code review agent", intervalHuman: "15m", runCount: 67, lastExitCode: 0, lastRunAt: iso(-180000), nextRunAt: iso(720000), pid: 23456, projectId: "agents", runHistory: [
    { runNumber: 67, startedAt: iso(-180000), exitCode: 0, duration: 8500, logSize: 2048, status: "completed", logOffset: 0 },
    { runNumber: 66, startedAt: iso(-1080000), exitCode: 0, duration: 9200, logSize: 1920, status: "completed", logOffset: 0 },
    { runNumber: 65, startedAt: iso(-1980000), exitCode: 0, duration: 7800, logSize: 1800, status: "completed", logOffset: 0 },
  ] }),
  mockLoop({ id: "loop-5", status: "waiting", command: "claude-code --auto-approve", description: "Claude automated fixes", intervalHuman: "30m", runCount: 23, lastExitCode: 0, lastRunAt: iso(-600000), nextRunAt: iso(1200000), projectId: "agents", runHistory: [
    { runNumber: 23, startedAt: iso(-600000), exitCode: 0, duration: 12000, logSize: 2560, status: "completed", logOffset: 0 },
    { runNumber: 22, startedAt: iso(-2400000), exitCode: 0, duration: 11500, logSize: 2400, status: "completed", logOffset: 0 },
  ] }),
];

const MOCK_TASKS: TaskDefinition[] = [
  { id: "task-1", name: "Build", command: "npm", commandArgs: ["run", "build"], commandRaw: "npm run build", onSuccessTaskId: null, onFailureTaskId: null, createdAt: iso(-86400000) },
  { id: "task-2", name: "Test", command: "pnpm", commandArgs: ["test"], commandRaw: "pnpm test", onSuccessTaskId: null, onFailureTaskId: null, createdAt: iso(-86400000) },
];

function mockRequest<T>(path: string): Promise<ApiResponse<T>> {
  let data: unknown = null;
  if (path.includes("/api/loops")) data = MOCK_LOOPS;
  else if (path.includes("/api/projects")) data = MOCK_PROJECTS;
  else if (path.includes("/api/tasks")) data = MOCK_TASKS;
  else if (path.includes("/api/loops/") && path.includes("/logs")) data = "=== Run #142\nBuilding project...\nnpm run build\nexit 0\n=== Run #141\nBuilding project...\nnpm run build\nexit 0\n=== Run #140\nBuilding project...\nnpm run build\nexit 1";
  else if (path.includes("/api/settings")) data = { httpApiEnabled: true, mcpApiEnabled: false, httpApiHost: "0.0.0.0" };
  return Promise.resolve({ ok: true, status: 200, data: data as T });
}

function mockSubscribeLogs(_loopId: string, onLine: (line: string) => void): () => void {
  const timer = setInterval(() => onLine(`[mock] ${new Date().toISOString()} log line`), 3000);
  return () => clearInterval(timer);
}

let mockEnvironments: Environment[] = [];
let mockSelectedId: string | null = null;

function loadMockEnvironments(): Environment[] {
  try {
    const raw = localStorage.getItem("orbion.envs.mock");
    if (raw) { mockEnvironments = JSON.parse(raw); }
  } catch { /* empty */ }
  if (mockEnvironments.length === 0) {
    mockEnvironments = [{
      id: "mock-env",
      name: "Mock VM",
      endpoints: [{ id: "ep1", kind: "direct" as EndpointKind, url: "http://localhost:8845", lastError: null, failureCount: 0 }],
      activeEndpointId: "ep1",
    }];
  }
  mockSelectedId = mockSelectedId ?? localStorage.getItem("orbion.selected.mock");
  return mockEnvironments;
}

function saveMockEnvironments(): void {
  try { localStorage.setItem("orbion.envs.mock", JSON.stringify(mockEnvironments)); } catch { /* empty */ }
  if (mockSelectedId) localStorage.setItem("orbion.selected.mock", mockSelectedId);
}

@injectable()
export class MockConfigService implements IConfigService {
  async getEnvironments(): Promise<Environment[]> {
    return loadMockEnvironments();
  }
  async addEnvironment(name: string, url: string, kind: EndpointKind = "direct"): Promise<Environment> {
    const env: Environment = {
      id: Math.random().toString(36).slice(2, 10),
      name,
      endpoints: [{ id: "ep1", kind, url, lastError: null, failureCount: 0 }],
      activeEndpointId: "ep1",
    };
    mockEnvironments = [...mockEnvironments, env];
    mockSelectedId = env.id;
    saveMockEnvironments();
    return env;
  }
  async removeEnvironment(id: string): Promise<void> {
    mockEnvironments = mockEnvironments.filter((e) => e.id !== id);
    if (mockSelectedId === id) mockSelectedId = null;
    saveMockEnvironments();
  }
  async addEndpoint(environmentId: string, url: string, kind: EndpointKind): Promise<AccessEndpoint | null> {
    const env = mockEnvironments.find((e) => e.id === environmentId);
    if (!env) return null;
    const ep: AccessEndpoint = { id: Math.random().toString(36).slice(2, 10), kind, url, lastError: null, failureCount: 0 };
    env.endpoints = [...env.endpoints, ep];
    saveMockEnvironments();
    return ep;
  }
  async removeEndpoint(environmentId: string, endpointId: string): Promise<void> {
    const env = mockEnvironments.find((e) => e.id === environmentId);
    if (!env) return;
    env.endpoints = env.endpoints.filter((e) => e.id !== endpointId);
    if (env.activeEndpointId === endpointId) env.activeEndpointId = env.endpoints[0]?.id ?? null;
    saveMockEnvironments();
  }
  async setActiveEndpoint(environmentId: string, endpointId: string): Promise<void> {
    const env = mockEnvironments.find((e) => e.id === environmentId);
    if (env) env.activeEndpointId = endpointId;
    saveMockEnvironments();
  }
  async getSelectedEnvironmentId(): Promise<string | null> {
    return mockSelectedId;
  }
  async setSelectedEnvironmentId(id: string | null): Promise<void> {
    mockSelectedId = id;
    saveMockEnvironments();
  }
  async migrateFromLocalStorage(): Promise<boolean> { return false; }
  async exchangePairingCode(): Promise<PairingCodeExchangeResponse> { return { ok: false, error: "mock" }; }
  async removeSessionToken(): Promise<void> {}
  async setOpenCodeEndpoint(_environmentId: string, _endpoint: OpenCodeEndpoint | null): Promise<SetOpenCodeEndpointResult> { return { ok: true }; }
  async setMainVm(environmentId: string): Promise<void> {
    mockEnvironments.forEach((e) => { e.role = e.id === environmentId ? "main-vm" : undefined; });
    saveMockEnvironments();
  }
  async getMainVmId(): Promise<string | null> {
    return mockEnvironments.find((e) => e.role === "main-vm")?.id ?? null;
  }
}

@injectable()
export class MockConnectionService implements IConnectionService {
  private statuses = new Map<string, ConnectionStatus>();
  private listeners: ((environmentId: string, status: ConnectionStatus) => void)[] = [];
  private healthListeners: ((environmentId: string, health: EndpointHealth[]) => void)[] = [];

  async getStatus(environmentId: string): Promise<ConnectionStatus | null> {
    return this.statuses.get(environmentId) ?? { phase: "connected", lastError: null, errorClass: null, failureCount: 0, backoffMs: 0, lastConnectedAt: Date.now() };
  }
  async getEndpointHealth(): Promise<EndpointHealth[]> { return []; }
  async retry(): Promise<void> {}
  onStatusChange(cb: (environmentId: string, status: ConnectionStatus) => void): () => void {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter((l) => l !== cb); };
  }
  onEndpointHealthChange(cb: (environmentId: string, health: EndpointHealth[]) => void): () => void {
    this.healthListeners.push(cb);
    return () => { this.healthListeners = this.healthListeners.filter((l) => l !== cb); };
  }
  notifyNetworkChanged(): void {}
}

@injectable()
export class MockOpenCodeService implements IOpenCodeService {
  async getStatus(): Promise<OpenCodeConnectionStatus> {
    return { authState: "unknown", errorKind: null, errorMessage: null, serverVersion: null, connectedProviders: [], checkedAt: null };
  }
  async refreshStatus(): Promise<OpenCodeConnectionStatus> { return this.getStatus(); }
  onStatusChange(): () => void { return () => {}; }
}

@injectable()
export class MockVmWizardService implements IVmWizardService {
  async listSshHosts(): Promise<SshHost[]> { return []; }
  async startWizard(): Promise<VmWizardResult> {
    return { environmentId: "mock", environmentName: "Mock", daemonUrl: "http://localhost:8845" };
  }
  onProgress(): () => void { return () => {}; }
  cancelWizard(): void {}
  respondConsent(): void {}
  respondServiceSelection(): void {}
}

@injectable()
export class MockInfraService implements IInfraService {
  async executeAction(args: InfraActionArgs): Promise<InfraActionResult> {
    if (args.action === "create-issue") {
      return {
        ok: true,
        data: {
          platform: "github" as const,
          url: `https://github.com/mock-org/mock-repo/issues/42`,
          number: 42,
        },
      };
    }
    if (args.action === "detect-platform") {
      const result: import("../../../../shared/ipc").PlatformDetectionResult = {
        platform: "github",
        remotes: ["https://github.com/mock-org/mock-repo.git"],
        cached: false,
      };
      return { ok: true, data: result };
    }
    return { ok: false, error: "mock" };
  }
  async getStatus(): Promise<{ mainVmId: string | null; connected: boolean }> { return { mainVmId: null, connected: false }; }
  async getPlatform(): Promise<PlatformType> { return "github"; }
}

@injectable()
export class MockApiService implements IApiService {
  async request<T>(args: ApiRequestArgs): Promise<ApiResponse<T>> {
    return mockRequest<T>(args.path);
  }
}

@injectable()
export class MockStreamService implements IStreamService {
  async subscribeStream(args: StreamSubscribeArgs): Promise<void> {
    const unsub = mockSubscribeLogs(args.path, (line) => {
      // dispatch via onStreamEvent listeners
      this.handlers.forEach((h) => h({ subId: args.subId, kind: "data", text: line }));
    });
    this.unsubs.set(args.subId, unsub);
  }
  async unsubscribeStream(subId: string): Promise<void> {
    this.unsubs.get(subId)?.();
    this.unsubs.delete(subId);
  }
  private handlers: ((payload: StreamEventPayload) => void)[] = [];
  private unsubs = new Map<string, () => void>();
  onStreamEvent(cb: (payload: StreamEventPayload) => void): () => void {
    this.handlers.push(cb);
    return () => { this.handlers = this.handlers.filter((h) => h !== cb); };
  }
}

@injectable()
export class MockTailscaleService implements ITailscaleService {
  async getPeers(): Promise<TailscalePeersResponse> { return { available: false, peers: [] }; }
}

@injectable()
export class MockNotificationService implements INotificationService {
  sendNotification(): void {}
  setMuted(): void {}
}
