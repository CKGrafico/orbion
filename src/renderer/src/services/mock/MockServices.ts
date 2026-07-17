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
  IBudgetService,
  IInboxService,
  InboxBuildParams,
  IOutageService,
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
  async getProjectPickupLabels(_projectId: string): Promise<string[]> {
    return ["to-implement"];
  }
  async setProjectPickupLabels(_projectId: string, _labels: string[]): Promise<void> {
    // mock: no-op
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
          reason = "breach-cleared";
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
