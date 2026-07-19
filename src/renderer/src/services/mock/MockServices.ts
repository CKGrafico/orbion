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
  SshHost,
  VmWizardResult,
  VmWizardStartOptions,
  BudgetWatch,
  BudgetBreach,
  InboxItem,
  InboxAction,
  InboxQueryResult,
  ResolvedInboxItem,
  InboxItemResolutionReason,
  ConditionWatch,
  DeepLinkTarget,
  NotificationSendArgs,
  OutageEscalation,
  ReachabilityStatus,
  ChatSession,
  TranscriptMessage,
  McpConnectionStatus,
  McpToolCallResult,
  BootstrapSeedExportResult,
  BootstrapSeedImportResult,
  RestoreAvailability,
  PullRestoreResult,
  AgentSendPromptArgs,
  AgentSendPromptResult,
  AgentStreamEvent,
  ConfigStamp,
  StampCheckedWriteResult,
} from "../../../../shared/ipc";
import { kindToNotificationType } from "../../../../shared/ipc";
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
  IBudgetService,
  IInboxService,
  InboxBuildParams,
  IOutageService,
  IReachabilityService,
  ITranscriptService,
  IMcpService,
  IAgentService,
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

const MOCK_CHAT_SESSIONS: ChatSession[] = [
  { id: "session-1", title: "Build pipeline setup", projectName: "Default", environmentId: "mock-env-1", workingDirectory: "/home/user/project", activeRuntime: "opencode", lastActiveAt: iso(-1800000), createdAt: iso(-86400000 * 2) },
  { id: "session-2", title: "Fix flaky tests", projectName: "Default", environmentId: "mock-env-1", workingDirectory: "/home/user/project", activeRuntime: "opencode", lastActiveAt: iso(-7200000), createdAt: iso(-86400000) },
  { id: "session-3", title: "ETL data migration", projectName: "ETL", environmentId: "mock-env-1", workingDirectory: "/home/user/etl-pipeline", activeRuntime: "opencode", lastActiveAt: iso(-3600000), createdAt: iso(-86400000 * 3) },
  { id: "session-4", title: "Agent code review", projectName: "Agents", environmentId: "mock-env-1", workingDirectory: "/home/user/agents", activeRuntime: "claude", lastActiveAt: iso(-600000), createdAt: iso(-86400000) },
  { id: "session-5", title: "Claude auto-fixes", projectName: "Agents", environmentId: "mock-env-1", workingDirectory: "/home/user/agents", activeRuntime: "claude", lastActiveAt: iso(-43200000), createdAt: iso(-86400000 * 5) },
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
let mockStamp: ConfigStamp = { timestamp: Date.now(), revision: 0 };

function mockBumpStamp(): void {
  mockStamp = { timestamp: Date.now(), revision: mockStamp.revision + 1 };
}

function loadMockEnvironments(): Environment[] {
  try {
    const raw = localStorage.getItem("orbion.envs.mock");
    if (raw) {
      const storedEnvironments = JSON.parse(raw) as Environment[];
      mockEnvironments = storedEnvironments.map((environment) => ({
        ...environment,
        agentRuntime: environment.agentRuntime === "claude" ? "claude" : "opencode",
      }));
    }
  } catch { /* empty */ }
  if (mockEnvironments.length === 0) {
    mockEnvironments = [{
      id: "mock-env",
      name: "Mock VM",
      agentRuntime: "opencode",
      runtimeState: "available",
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
      agentRuntime: "opencode",
      endpoints: [{ id: "ep1", kind, url, lastError: null, failureCount: 0 }],
      activeEndpointId: "ep1",
    };
    mockEnvironments = [...mockEnvironments, env];
    mockSelectedId = env.id;
    mockBumpStamp();
    saveMockEnvironments();
    return env;
  }
  async removeEnvironment(id: string): Promise<void> {
    mockEnvironments = mockEnvironments.filter((e) => e.id !== id);
    if (mockSelectedId === id) mockSelectedId = null;
    mockBumpStamp();
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
  async getProjectPickupLabels(_projectId: string): Promise<string[]> {
    return ["to-implement"];
  }
  async setProjectPickupLabels(_projectId: string, _labels: string[]): Promise<void> {
    // mock: no-op
  }
  async getChatSessions(): Promise<ChatSession[]> {
    try {
      const raw = localStorage.getItem("orbion.sessions.mock");
      if (raw) return JSON.parse(raw) as ChatSession[];
    } catch { /* empty */ }
    return [...MOCK_CHAT_SESSIONS];
  }
  async addChatSession(session: Omit<ChatSession, "id" | "createdAt">): Promise<ChatSession> {
    const newSession: ChatSession = {
      ...session,
      id: `session-${Math.random().toString(36).slice(2, 10)}`,
      createdAt: new Date().toISOString(),
    };
    const sessions = await this.getChatSessions();
    sessions.push(newSession);
    try { localStorage.setItem("orbion.sessions.mock", JSON.stringify(sessions)); } catch { /* empty */ }
    return newSession;
  }
  async removeChatSession(sessionId: string): Promise<void> {
    const sessions = await this.getChatSessions();
    const filtered = sessions.filter((s) => s.id !== sessionId);
    try { localStorage.setItem("orbion.sessions.mock", JSON.stringify(filtered)); } catch { /* empty */ }
  }
  async updateChatSession(sessionId: string, updates: Partial<Pick<ChatSession, "title" | "lastActiveAt" | "environmentId" | "workingDirectory" | "activeRuntime">>): Promise<void> {
    const sessions = await this.getChatSessions();
    const idx = sessions.findIndex((s) => s.id === sessionId);
    if (idx >= 0) {
      sessions[idx] = { ...sessions[idx], ...updates };
      try { localStorage.setItem("orbion.sessions.mock", JSON.stringify(sessions)); } catch { /* empty */ }
    }
  }
  async getExpandedProjects(): Promise<string[]> {
    try {
      const raw = localStorage.getItem("orbion.expanded.mock");
      if (raw) return JSON.parse(raw) as string[];
    } catch { /* empty */ }
    return [];
  }
  async setExpandedProjects(expandedKeys: string[]): Promise<void> {
    try { localStorage.setItem("orbion.expanded.mock", JSON.stringify(expandedKeys)); } catch { /* empty */ }
  }
  async exportBootstrapSeed(): Promise<BootstrapSeedExportResult> {
    const mainVm = mockEnvironments.find((e) => e.role === "main-vm");
    if (!mainVm) {
      return { ok: false, error: { key: "bootstrapSeed.noMainVm" } };
    }
    const activeEndpoint = mainVm.endpoints.find((ep) => ep.id === mainVm.activeEndpointId) ?? mainVm.endpoints[0];
    if (!activeEndpoint) {
      return { ok: false, error: { key: "bootstrapSeed.noEndpoint" } };
    }
    const kind = activeEndpoint.kind === "ssh" ? "ssh" as const : "direct" as const;
    const target = kind === "ssh" && activeEndpoint.sshTarget
      ? activeEndpoint.sshTarget
      : activeEndpoint.url;
    const { encodeBootstrapSeed } = await import("../../../../shared/utils");
    const seed = encodeBootstrapSeed({ kind, target, name: mainVm.name });
    return { ok: true, seed };
  }
  async importBootstrapSeed(seedString: string): Promise<BootstrapSeedImportResult> {
    const { decodeBootstrapSeed } = await import("../../../../shared/utils");
    const seed = decodeBootstrapSeed(seedString);
    if (!seed) {
      return { ok: false, error: { key: "bootstrapSeed.invalidSeed" } };
    }
    return { ok: true, seed };
  }
  async checkRestoreAvailable(): Promise<RestoreAvailability> {
    // Mock: simulate a config-home with 2 environments available for restore
    return {
      available: true,
      environmentCount: 2,
      environmentNames: ["Production Server", "Staging VM"],
    };
  }
  async pullRestore(): Promise<PullRestoreResult> {
    // Mock: simulate restoring environments by adding mock entries
    const restored: Environment[] = [
      {
        id: "restored-1",
        name: "Production Server",
        agentRuntime: "opencode",
        endpoints: [{ id: "rep-1", kind: "ssh" as EndpointKind, url: "http://localhost:8845", sshTarget: null, lastError: null, failureCount: 0 }],
        activeEndpointId: "rep-1",
        authState: "unauthenticated",
      },
      {
        id: "restored-2",
        name: "Staging VM",
        agentRuntime: "claude",
        endpoints: [{ id: "rep-2", kind: "direct" as EndpointKind, url: "http://localhost:8846", lastError: null, failureCount: 0 }],
        activeEndpointId: "rep-2",
        authState: "unauthenticated",
      },
    ];
    mockEnvironments = restored;
    mockSelectedId = restored[0]?.id ?? null;
    mockBumpStamp();
    saveMockEnvironments();
    return { ok: true, restored };
  }
  async getConfigStamp(): Promise<ConfigStamp> {
    return mockStamp;
  }
  async stampCheckedSetMainVm(environmentId: string, knownStamp: ConfigStamp): Promise<StampCheckedWriteResult> {
    if (mockStamp.revision !== knownStamp.revision || mockStamp.timestamp !== knownStamp.timestamp) {
      return { ok: false, stale: { stale: true, currentStamp: mockStamp, knownStamp } };
    }
    mockEnvironments.forEach((e) => { e.role = e.id === environmentId ? "main-vm" as const : undefined; });
    mockBumpStamp();
    saveMockEnvironments();
    return { ok: true, stamp: mockStamp };
  }
  async forceSetMainVm(environmentId: string): Promise<ConfigStamp> {
    mockEnvironments.forEach((e) => { e.role = e.id === environmentId ? "main-vm" as const : undefined; });
    mockBumpStamp();
    saveMockEnvironments();
    return mockStamp;
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
  async getStatus(environmentId: string): Promise<OpenCodeConnectionStatus> {
    const envs = await new MockConfigService().getEnvironments();
    const env = envs.find((e) => e.id === environmentId);
    // Environments named "no-runtime" or "auth" simulate runtime issues
    // so the runtime health chip can be tested in dev mode.
    const name = env?.name.toLowerCase() ?? "";
    if (name.includes("no-runtime")) {
      return { authState: "unknown", errorKind: "unreachable", errorMessage: "Runtime not found", serverVersion: null, connectedProviders: [], checkedAt: Date.now() };
    }
    if (name.includes("auth-problem")) {
      return { authState: "unauthenticated", errorKind: "unauthenticated", errorMessage: "Run `opencode auth login` on the VM to connect a provider", serverVersion: null, connectedProviders: [], checkedAt: Date.now() };
    }
    if (name.includes("rejected")) {
      return { authState: "unknown", errorKind: "rejected", errorMessage: "Wrong password for OpenCode server", serverVersion: null, connectedProviders: [], checkedAt: Date.now() };
    }
    // Default: authenticated
    return { authState: "authenticated", errorKind: null, errorMessage: null, serverVersion: "1.2.0", connectedProviders: ["openai"], checkedAt: Date.now() };
  }
  async refreshStatus(environmentId: string): Promise<OpenCodeConnectionStatus> { return this.getStatus(environmentId); }
  onStatusChange(): () => void { return () => {}; }
}

@injectable()
export class MockVmWizardService implements IVmWizardService {
  async listSshHosts(): Promise<SshHost[]> { return []; }
  async startWizard(options: VmWizardStartOptions): Promise<VmWizardResult> {
    loadMockEnvironments();

    const environmentId = Math.random().toString(36).slice(2, 10);
    const environmentName = options.name?.trim() || options.target || "Mock";
    const daemonUrl = options.directUrl ?? "http://localhost:8845";
    const endpointKind: EndpointKind = options.reachMethod === "ssh" ? "ssh" : "direct";
    const environment: Environment = {
      id: environmentId,
      name: environmentName,
      agentRuntime: options.agentRuntime,
      runtimeState: "available",
      endpoints: [{
        id: "ep1",
        kind: endpointKind,
        url: daemonUrl,
        sshTarget: endpointKind === "ssh" ? options.target : null,
        lastError: null,
        failureCount: 0,
      }],
      activeEndpointId: "ep1",
    };

    mockEnvironments = [...mockEnvironments, environment];
    mockSelectedId = environmentId;
    saveMockEnvironments();

    return { environmentId, environmentName, daemonUrl };
  }
  onProgress(): () => void { return () => {}; }
  cancelWizard(): void {}
  respondConsent(): void {}
  respondServiceSelection(): void {}
  respondRuntimeConsent(): void {}
  respondHostKey(): void {}
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
    if (args.action === "list-issues") {
      const listResult: import("../../../../shared/ipc").ListIssuesResult = {
        platform: "github",
        issues: [
          {
            number: 42,
            title: "Setup CI pipeline",
            url: "https://github.com/mock-org/mock-repo/issues/42",
            labels: ["to-implement", "devops"],
            state: "open",
            createdAt: new Date(now - 86400000 * 5).toISOString(),
            updatedAt: new Date(now - 86400000).toISOString(),
          },
          {
            number: 38,
            title: "Add error boundary",
            url: "https://github.com/mock-org/mock-repo/issues/38",
            labels: ["to-implement"],
            state: "open",
            createdAt: new Date(now - 86400000 * 3).toISOString(),
            updatedAt: new Date(now - 86400000 * 2).toISOString(),
          },
          {
            number: 31,
            title: "Implement auth flow",
            url: "https://github.com/mock-org/mock-repo/issues/31",
            labels: ["to-implement", "security"],
            state: "open",
            createdAt: new Date(now - 86400000 * 7).toISOString(),
            updatedAt: new Date(now - 86400000 * 4).toISOString(),
          },
        ],
        total: 3,
        truncated: false,
      };
      return { ok: true, data: listResult };
    }
    if (args.action === "add-label") {
      const params = args.params as { issueNumber?: number; labels?: string[] } | undefined;
      return {
        ok: true,
        data: {
          issueNumber: params?.issueNumber ?? 42,
          labels: params?.labels ?? [],
        },
      };
    }
    if (args.action === "edit-issue") {
      const params = args.params as { issueNumber?: number; title?: string; body?: string; addLabels?: string[]; removeLabels?: string[] } | undefined;
      const changes: Record<string, unknown> = {};
      if (params?.title) changes.title = true;
      if (params?.body) changes.body = true;
      if (params?.addLabels?.length) changes.labelsAdded = params.addLabels;
      if (params?.removeLabels?.length) changes.labelsRemoved = params.removeLabels;
      return {
        ok: true,
        data: {
          platform: "github",
          issueNumber: params?.issueNumber ?? 42,
          changes,
        },
      };
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
  private muted = false;
  private clickListeners: ((deepLink: DeepLinkTarget) => void)[] = [];

  async send(_args: NotificationSendArgs): Promise<void> {
    // Mock: no-op in browser dev mode
  }

  async setMuted(muted: boolean): Promise<void> {
    this.muted = muted;
  }

  async isMuted(): Promise<boolean> {
    return this.muted;
  }

  onClick(cb: (deepLink: DeepLinkTarget) => void): () => void {
    this.clickListeners.push(cb);
    return () => {
      this.clickListeners = this.clickListeners.filter((l) => l !== cb);
    };
  }

  /** Test helper: simulate a notification click. */
  simulateClick(deepLink: DeepLinkTarget): void {
    for (const listener of this.clickListeners) {
      listener(deepLink);
    }
  }
}

let mockWatches: BudgetWatch[] = [];
let mockBreaches: BudgetBreach[] = [];

@injectable()
export class MockBudgetService implements IBudgetService {
  async getWatches(): Promise<BudgetWatch[]> { return mockWatches; }
  async addWatch(watch: Omit<BudgetWatch, "id" | "createdAt">): Promise<BudgetWatch> {
    const newWatch: BudgetWatch = {
      ...watch,
      id: Math.random().toString(36).slice(2, 10),
      createdAt: new Date().toISOString(),
    };
    mockWatches = [...mockWatches, newWatch];
    return newWatch;
  }
  async removeWatch(watchId: string): Promise<void> {
    mockWatches = mockWatches.filter((w) => w.id !== watchId);
  }
  async updateWatch(watchId: string, updates: Partial<Pick<BudgetWatch, "threshold" | "autoPause" | "enabled">>): Promise<void> {
    mockWatches = mockWatches.map((w) => w.id === watchId ? { ...w, ...updates } : w);
  }
  async getBreaches(): Promise<BudgetBreach[]> { return mockBreaches; }
  async addBreach(breach: Omit<BudgetBreach, "id">): Promise<BudgetBreach> {
    const newBreach: BudgetBreach = {
      ...breach,
      id: Math.random().toString(36).slice(2, 10),
    };
    mockBreaches = [...mockBreaches, newBreach];
    return newBreach;
  }
  async dismissBreach(breachId: string): Promise<void> {
    mockBreaches = mockBreaches.map((b) => b.id === breachId ? { ...b, dismissed: true } : b);
  }
  async pauseLoop(): Promise<ApiResponse> { return { ok: true, status: 200 }; }
  async resumeLoop(): Promise<ApiResponse> { return { ok: true, status: 200 }; }
}

let mockDismissedIds: Set<string> = new Set();
let mockResolvedItems: ResolvedInboxItem[] = [];

@injectable()
export class MockInboxService implements IInboxService {
  async getDismissedIds(): Promise<string[]> { return [...mockDismissedIds]; }
  async dismissItem(itemId: string): Promise<void> { mockDismissedIds.add(itemId); }
  buildItems(params: InboxBuildParams): InboxItem[] {
    const { perEnvLoops, perEnvHealth, environments, breaches } = params;
    const items: InboxItem[] = [];

    for (const breach of breaches) {
      if (breach.dismissed || mockDismissedIds.has(`breach:${breach.id}`)) continue;
      items.push({
        id: `breach:${breach.id}`,
        kind: "breach",
        notificationType: kindToNotificationType("breach"),
        environmentId: breach.environmentId,
        environmentName: breach.environmentName,
        loopId: breach.loopId,
        title: breach.loopDescription,
        detail: `${breach.runsToday}/${breach.threshold} runs`,
        occurredAt: breach.breachedAt,
        dismissed: false,
        availableActions: ["dismiss", "open-in-chat"],
      });
    }

    for (const env of environments) {
      const health = perEnvHealth[env.id];

      // Prolonged-offline from escalated outages
      const escalated = params.escalatedOutages.get(env.id);
      if (escalated) {
        if (!mockDismissedIds.has(`prolonged-offline:${env.id}`)) {
          items.push({
            id: `prolonged-offline:${env.id}`,
            kind: "prolonged-offline",
            notificationType: kindToNotificationType("prolonged-offline"),
            environmentId: env.id,
            environmentName: env.name,
            title: env.name,
            detail: "unreachable for 10m+",
            occurredAt: escalated.since,
            outageSince: escalated.since,
            dismissed: false,
            availableActions: ["dismiss"],
          });
        }
        continue;
      }

      if (health === "offline" || health === "unknown") {
        if (!mockDismissedIds.has(`offline:${env.id}`)) {
          items.push({
            id: `offline:${env.id}`,
            kind: "instance-offline",
            notificationType: kindToNotificationType("instance-offline"),
            environmentId: env.id,
            environmentName: env.name,
            title: env.name,
            detail: "offline",
            occurredAt: new Date().toISOString(),
            dismissed: false,
            availableActions: ["dismiss"],
          });
        }
        continue;
      }
      const envLoops = perEnvLoops[env.id] ?? [];
      for (const loop of envLoops) {
        const isFinished = loop.maxRuns !== null && loop.runCount >= loop.maxRuns;
        const isFailed = loop.lastExitCode !== null && loop.lastExitCode !== 0;

        if (isFailed && !isFinished) {
          const itemId = `failed-loop:${env.id}:${loop.id}`;
          if (mockDismissedIds.has(itemId)) continue;
          items.push({
            id: itemId,
            kind: "failed-loop",
            notificationType: kindToNotificationType("failed-loop"),
            environmentId: env.id,
            environmentName: env.name,
            loopId: loop.id,
            title: loop.description?.trim() || loop.id,
            detail: `exit ${loop.lastExitCode}`,
            occurredAt: loop.lastRunAt ?? new Date().toISOString(),
            dismissed: false,
            availableActions: ["run-now", "pause", "open-in-chat"],
            projectId: loop.projectId,
          });
        } else if (isFinished) {
          const itemId = `finished-loop:${env.id}:${loop.id}`;
          if (mockDismissedIds.has(itemId)) continue;
          items.push({
            id: itemId,
            kind: "finished-loop",
            notificationType: kindToNotificationType("finished-loop"),
            environmentId: env.id,
            environmentName: env.name,
            loopId: loop.id,
            title: loop.description?.trim() || loop.id,
            detail: `${loop.runCount}/${loop.maxRuns} runs`,
            occurredAt: loop.lastRunAt ?? new Date().toISOString(),
            dismissed: false,
            availableActions: ["dismiss", "restart"],
            projectId: loop.projectId,
          });
        }
      }
    }

    items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
    return items;
  }

  queryFleet(question: string, params: InboxBuildParams): InboxQueryResult {
    const items = this.buildItems(params);
    if (items.length === 0) {
      return { answer: "All clear! Nothing needs your attention right now.", references: [] };
    }
    const lines: string[] = [`**${items.length} items need attention:**\n`];
    const refs: InboxItem[] = [];
    for (const item of items.slice(0, 10)) {
      refs.push(item);
      lines.push(`- [${item.title}](inbox://${item.id}) on **${item.environmentName}**${item.detail ? ` (${item.detail})` : ""}`);
    }
    return { answer: lines.join("\n"), references: refs };
  }

  async resolveItem(resolved: ResolvedInboxItem): Promise<void> {
    if (!mockResolvedItems.some((ri) => ri.item.id === resolved.item.id)) {
      mockResolvedItems.push(resolved);
    }
  }

  async getResolvedItems(): Promise<ResolvedInboxItem[]> {
    // Prune items older than 30 days
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1_000;
    mockResolvedItems = mockResolvedItems.filter(
      (ri) => new Date(ri.resolvedAt).getTime() >= cutoff,
    );
    return mockResolvedItems;
  }

  async pruneResolvedItems(): Promise<void> {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1_000;
    mockResolvedItems = mockResolvedItems.filter(
      (ri) => new Date(ri.resolvedAt).getTime() >= cutoff,
    );
  }

  detectAutoResolutions(
    previousItems: InboxItem[],
    currentIds: Set<string>,
    dismissedIds: Set<string>,
  ): ResolvedInboxItem[] {
    const resolved: ResolvedInboxItem[] = [];
    const now = new Date().toISOString();

    for (const item of previousItems) {
      if (currentIds.has(item.id)) continue;
      if (dismissedIds.has(item.id)) continue;

      let reason: InboxItemResolutionReason = "loop-recovered";
      switch (item.kind) {
        case "failed-loop":
        case "finished-loop":
          reason = "loop-recovered";
          break;
        case "breach":
        case "pending-approval":
        case "awaiting-input":
        case "digest":
          reason = "watch-cleared";
          break;
        case "instance-offline":
          reason = "instance-online";
          break;
        case "prolonged-offline":
          reason = "outage-resolved";
          break;
      }

      resolved.push({ item, resolvedAt: now, resolution: reason });
    }

    return resolved;
  }

  async executeInboxAction(item: InboxItem, action: InboxAction): Promise<ApiResponse> {
    // Mock: all actions succeed immediately
    if (action === "dismiss") {
      mockDismissedIds.add(item.id);
    }
    return { ok: true, status: 200 };
  }
}

@injectable()
export class MockOutageService implements IOutageService {
  async getEscalations(): Promise<OutageEscalation[]> {
    return [];
  }

  onEscalation(): () => void {
    return () => {};
  }

  onResolve(): () => void {
    return () => {};
  }
}

@injectable()
export class MockReachabilityService implements IReachabilityService {
  private listeners: ((status: ReachabilityStatus) => void)[] = [];

  async getStatus(environmentId: string): Promise<ReachabilityStatus | null> {
    const envs = await new MockConfigService().getEnvironments();
    const env = envs.find((e) => e.id === environmentId);
    // Environments named "offline" or "unreachable" simulate an unreachable
    // state so the "unknown" loop rendering can be tested in dev mode.
    const isUnreachable = env?.name.toLowerCase().includes("offline") || env?.name.toLowerCase().includes("unreachable");
    return {
      environmentId,
      state: isUnreachable ? "unreachable" as const : "connected" as const,
      changedAt: new Date().toISOString(),
    };
  }

  async getAll(): Promise<ReachabilityStatus[]> {
    const envs = await new MockConfigService().getEnvironments();
    return envs.map((env) => {
      const isUnreachable = env.name.toLowerCase().includes("offline") || env.name.toLowerCase().includes("unreachable");
      return {
        environmentId: env.id,
        state: isUnreachable ? "unreachable" as const : "connected" as const,
        changedAt: new Date().toISOString(),
      };
    });
  }

  onStatusChange(cb: (status: ReachabilityStatus) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }
}

// ---------------------------------------------------------------------------
// Mock Transcript Service (localStorage-backed for browser-only dev)
// ---------------------------------------------------------------------------

const TRANSCRIPT_KEY_PREFIX = "orbion.transcript.";

@injectable()
export class MockTranscriptService implements ITranscriptService {
  private getKey(sessionId: string): string {
    return `${TRANSCRIPT_KEY_PREFIX}${sessionId}`;
  }

  async getMessages(sessionId: string): Promise<TranscriptMessage[]> {
    try {
      const raw = localStorage.getItem(this.getKey(sessionId));
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed as TranscriptMessage[];
    } catch {
      return [];
    }
  }

  async appendMessage(message: Omit<TranscriptMessage, "createdAt">): Promise<TranscriptMessage> {
    const messages = await this.getMessages(message.sessionId);
    const withTimestamp: TranscriptMessage = {
      ...message,
      createdAt: new Date().toISOString(),
    };
    messages.push(withTimestamp);
    localStorage.setItem(this.getKey(message.sessionId), JSON.stringify(messages));
    return withTimestamp;
  }

  async appendMessages(batch: Array<Omit<TranscriptMessage, "createdAt">>): Promise<TranscriptMessage[]> {
    if (batch.length === 0) return [];
    const sessionId = batch[0].sessionId;
    const messages = await this.getMessages(sessionId);
    const withTimestamps: TranscriptMessage[] = batch.map((msg) => ({
      ...msg,
      createdAt: new Date().toISOString(),
    }));
    messages.push(...withTimestamps);
    localStorage.setItem(this.getKey(sessionId), JSON.stringify(messages));
    return withTimestamps;
  }

  async updateMessage(messageId: string, updates: Partial<Pick<TranscriptMessage, "content" | "toolCalls" | "finishedAt">>): Promise<void> {
    // Find the session containing this message
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(TRANSCRIPT_KEY_PREFIX)) continue;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const messages: TranscriptMessage[] = JSON.parse(raw);
        const idx = messages.findIndex((m) => m.id === messageId);
        if (idx !== -1) {
          messages[idx] = { ...messages[idx], ...updates };
          localStorage.setItem(key, JSON.stringify(messages));
          return;
        }
      } catch {
        continue;
      }
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    localStorage.removeItem(this.getKey(sessionId));
  }
}

// ---------------------------------------------------------------------------
// Mock MCP Service (browser-only dev)
// ---------------------------------------------------------------------------

const MOCK_MCP_TOOLS = [
  { name: "create_loop", description: "Create a new loop" },
  { name: "list_loops", description: "List all loops" },
  { name: "pause_loop", description: "Pause a running loop" },
  { name: "resume_loop", description: "Resume a paused loop" },
  { name: "stop_loop", description: "Stop a loop" },
  { name: "trigger_loop", description: "Trigger an immediate loop run" },
  { name: "list_tasks", description: "List all task definitions" },
  { name: "list_projects", description: "List all projects" },
];

@injectable()
export class MockMcpService implements IMcpService {
  private listeners: ((status: McpConnectionStatus) => void)[] = [];

  async getStatus(environmentId: string): Promise<McpConnectionStatus> {
    const envs = await new MockConfigService().getEnvironments();
    const env = envs.find((e) => e.id === environmentId);
    // Environments named "no-mcp" simulate MCP unavailability
    const isUnavailable = env?.name.toLowerCase().includes("no-mcp");
    return {
      environmentId,
      state: isUnavailable ? "unreachable" : "connected",
      tools: isUnavailable ? [] : MOCK_MCP_TOOLS,
      lastError: isUnavailable ? "MCP server not available" : null,
      connectedAt: isUnavailable ? null : Date.now(),
    };
  }

  async connect(environmentId: string): Promise<McpConnectionStatus> {
    return this.getStatus(environmentId);
  }

  async disconnect(): Promise<void> {
    // Mock: no-op
  }

  async callTool(environmentId: string, toolName: string, _args: Record<string, unknown>): Promise<McpToolCallResult> {
    const status = await this.getStatus(environmentId);
    if (status.state !== "connected") {
      return { ok: false, error: "MCP server not connected" };
    }

    const known = status.tools.some((t) => t.name === toolName);
    if (!known) {
      return { ok: false, error: `Unknown MCP tool: ${toolName}` };
    }

    // Mock: return a generic success response
    return { ok: true, data: { message: `Mock result for ${toolName}` } };
  }

  onStatusChange(cb: (status: McpConnectionStatus) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }
}

// ---------------------------------------------------------------------------
// Mock Agent Service (browser-only dev — simulates streaming)
// ---------------------------------------------------------------------------

const MOCK_AGENT_RESPONSE = `I can help you with that. Here's what I found:

The **ETL** project has 3 active loops:
- \`daily-sync\` runs every 30 minutes and is currently **running**
- \`hourly-report\` runs every hour and is **waiting** for its next run
- \`weekly-cleanup\` runs weekly and is **paused**

Would you like me to check any of these in more detail, or would you like to perform an action on them?`;

@injectable()
export class MockAgentService implements IAgentService {
  private streamListeners: ((event: AgentStreamEvent) => void)[] = [];
  private activeTimers: ReturnType<typeof setInterval>[] = [];

  async sendPrompt(args: AgentSendPromptArgs): Promise<AgentSendPromptResult> {
    // Simulate streaming the mock response character by character
    const text = MOCK_AGENT_RESPONSE;
    let idx = 0;

    const timer = setInterval(() => {
      const chunkSize = Math.floor(Math.random() * 4) + 2;
      const chunk = text.slice(idx, idx + chunkSize);
      idx += chunkSize;

      if (chunk) {
        this.emitStreamEvent({
          kind: "text-delta",
          chatSessionId: args.chatSessionId,
          turnId: args.turnId,
          text: chunk,
        });
      }

      if (idx >= text.length) {
        clearInterval(timer);
        this.activeTimers = this.activeTimers.filter((t) => t !== timer);
        this.emitStreamEvent({
          kind: "turn-finished",
          chatSessionId: args.chatSessionId,
          turnId: args.turnId,
        });
      }
    }, 25);

    this.activeTimers.push(timer);

    return { ok: true, sessionId: `mock-session-${Date.now()}` };
  }

  async interrupt(): Promise<void> {
    // Stop all active streaming timers
    for (const timer of this.activeTimers) {
      clearInterval(timer);
    }
    this.activeTimers = [];
  }

  onStreamEvent(cb: (event: AgentStreamEvent) => void): () => void {
    this.streamListeners.push(cb);
    return () => {
      this.streamListeners = this.streamListeners.filter((l) => l !== cb);
    };
  }

  private emitStreamEvent(event: AgentStreamEvent): void {
    for (const listener of this.streamListeners) {
      listener(event);
    }
  }
}
