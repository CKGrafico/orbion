import { contextBridge, ipcRenderer } from "electron";
import type {
  ApiRequestArgs,
  ConnectionStatus,
  EndpointHealth,
  StreamSubscribeArgs,
  StreamEventPayload,
  TailscalePeersResponse,
  LoopTaskBridge,
  PairingCodeExchangeResponse,
  SessionScope,
  OpenCodeConnectionStatus,
  OpenCodeEndpoint,
  SetOpenCodeEndpointResult,
  VmWizardProgress,
  VmWizardResult,
  VmWizardStartOptions,
  VmWizardServiceSelection,
  SshHost,
  InfraActionArgs,
  InfraActionResult,
  PlatformType,
  BudgetWatch,
  BudgetBreach,
  InboxItem,
  InboxQueryResult,
  ResolvedInboxItem,
  ConditionWatch,
  NotificationSendArgs,
  DeepLinkTarget,
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
  ListModelsResult,
  SweepEphemeralSessionsArgs,
  SweepEphemeralSessionsResult,
  LoopShape,
  GlobalSettings,
} from "../shared/ipc.js";

const bridge: LoopTaskBridge = {
  request: (args: ApiRequestArgs) => ipcRenderer.invoke("api:request", args),

  subscribeStream: (args: StreamSubscribeArgs) =>
    ipcRenderer.invoke("stream:subscribe", args),

  unsubscribeStream: (subId: string) =>
    ipcRenderer.invoke("stream:unsubscribe", subId),

  onStreamEvent: (cb: (payload: StreamEventPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: StreamEventPayload): void => {
      cb(payload);
    };
    ipcRenderer.on("stream:event", listener);
    return () => {
      ipcRenderer.removeListener("stream:event", listener);
    };
  },

  config: {
    getEnvironments: () => ipcRenderer.invoke("config:getEnvironments"),
    addEnvironment: (name: string, url: string, kind?: string) =>
      ipcRenderer.invoke("config:addEnvironment", name, url, kind),
    removeEnvironment: (id: string) => ipcRenderer.invoke("config:removeEnvironment", id),
    addEndpoint: (environmentId: string, url: string, kind: string) =>
      ipcRenderer.invoke("config:addEndpoint", environmentId, url, kind),
    removeEndpoint: (environmentId: string, endpointId: string) =>
      ipcRenderer.invoke("config:removeEndpoint", environmentId, endpointId),
    setActiveEndpoint: (environmentId: string, endpointId: string) =>
      ipcRenderer.invoke("config:setActiveEndpoint", environmentId, endpointId),
    getSelectedEnvironmentId: () => ipcRenderer.invoke("config:getSelectedEnvironmentId"),
    setSelectedEnvironmentId: (id: string | null) =>
      ipcRenderer.invoke("config:setSelectedEnvironmentId", id),
    migrateFromLocalStorage: (rawInstances: string, rawSelectedId: string | null) =>
      ipcRenderer.invoke("config:migrateFromLocalStorage", rawInstances, rawSelectedId),
    exchangePairingCode: (baseUrl: string, code: string, scope?: SessionScope) =>
      ipcRenderer.invoke("config:exchangePairingCode", baseUrl, code, scope) as Promise<PairingCodeExchangeResponse>,
    removeSessionToken: (environmentId: string) =>
      ipcRenderer.invoke("config:removeSessionToken", environmentId),
    setOpenCodeEndpoint: (environmentId: string, endpoint: OpenCodeEndpoint | null) =>
      ipcRenderer.invoke("config:setOpenCodeEndpoint", environmentId, endpoint) as Promise<SetOpenCodeEndpointResult>,
    setInfraOpenCodeEndpoint: (environmentId: string, endpoint: OpenCodeEndpoint | null) =>
      ipcRenderer.invoke("config:setInfraOpenCodeEndpoint", environmentId, endpoint) as Promise<SetOpenCodeEndpointResult>,
    setMainVm: (environmentId: string) =>
      ipcRenderer.invoke("config:setMainVm", environmentId) as Promise<void>,
    getMainVmId: () =>
      ipcRenderer.invoke("config:getMainVmId") as Promise<string | null>,
    getProjectPickupLabels: (projectId: string) =>
      ipcRenderer.invoke("config:getProjectPickupLabels", projectId) as Promise<string[]>,
    setProjectPickupLabels: (projectId: string, labels: string[]) =>
      ipcRenderer.invoke("config:setProjectPickupLabels", projectId, labels) as Promise<void>,
    getProjectPipelineLabels: (projectId: string) =>
      ipcRenderer.invoke("config:getProjectPipelineLabels", projectId) as Promise<string[]>,
    setProjectPipelineLabels: (projectId: string, labels: string[]) =>
      ipcRenderer.invoke("config:setProjectPipelineLabels", projectId, labels) as Promise<void>,
    getChatSessions: () =>
      ipcRenderer.invoke("config:getChatSessions") as Promise<ChatSession[]>,
    addChatSession: (session: Omit<ChatSession, "id" | "createdAt">) =>
      ipcRenderer.invoke("config:addChatSession", session) as Promise<ChatSession>,
    removeChatSession: (sessionId: string) =>
      ipcRenderer.invoke("config:removeChatSession", sessionId) as Promise<void>,
    updateChatSession: (sessionId: string, updates: Partial<Pick<ChatSession, "title" | "lastActiveAt" | "projectName" | "environmentId" | "workingDirectory" | "activeRuntime" | "activeModel" | "reasoningEffort" | "persisted" | "turnCount" | "declineAutoPersistUntil">>) =>
      ipcRenderer.invoke("config:updateChatSession", sessionId, updates) as Promise<void>,
    getExpandedProjects: () =>
      ipcRenderer.invoke("config:getExpandedProjects") as Promise<string[]>,
    setExpandedProjects: (expandedKeys: string[]) =>
      ipcRenderer.invoke("config:setExpandedProjects", expandedKeys) as Promise<void>,
    exportBootstrapSeed: () =>
      ipcRenderer.invoke("config:exportBootstrapSeed") as Promise<BootstrapSeedExportResult>,
    importBootstrapSeed: (seedString: string) =>
      ipcRenderer.invoke("config:importBootstrapSeed", seedString) as Promise<BootstrapSeedImportResult>,
    checkRestoreAvailable: () =>
      ipcRenderer.invoke("config:checkRestoreAvailable") as Promise<RestoreAvailability>,
    pullRestore: () =>
      ipcRenderer.invoke("config:pullRestore") as Promise<PullRestoreResult>,
    getConfigStamp: () =>
      ipcRenderer.invoke("config:getConfigStamp") as Promise<ConfigStamp>,
    stampCheckedSetMainVm: (environmentId: string, knownStamp: ConfigStamp) =>
      ipcRenderer.invoke("config:stampCheckedSetMainVm", environmentId, knownStamp) as Promise<StampCheckedWriteResult>,
    forceSetMainVm: (environmentId: string) =>
      ipcRenderer.invoke("config:forceSetMainVm", environmentId) as Promise<ConfigStamp>,
    sweepEphemeralSessions: (args: SweepEphemeralSessionsArgs) =>
      ipcRenderer.invoke("config:sweepEphemeralSessions", args) as Promise<SweepEphemeralSessionsResult>,
  },

  connection: {
    getStatus: (environmentId: string) =>
      ipcRenderer.invoke("connection:getStatus", environmentId) as Promise<ConnectionStatus | null>,
    getEndpointHealth: (environmentId: string) =>
      ipcRenderer.invoke("connection:getEndpointHealth", environmentId) as Promise<EndpointHealth[]>,
    retry: (environmentId: string) =>
      ipcRenderer.invoke("connection:retry", environmentId) as Promise<void>,
    onStatusChange: (cb: (environmentId: string, status: ConnectionStatus) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        environmentId: string,
        status: ConnectionStatus,
      ): void => {
        cb(environmentId, status);
      };
      ipcRenderer.on("connection:status", listener);
      return () => {
        ipcRenderer.removeListener("connection:status", listener);
      };
    },
    onEndpointHealthChange: (cb: (environmentId: string, health: EndpointHealth[]) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        environmentId: string,
        health: EndpointHealth[],
      ): void => {
        cb(environmentId, health);
      };
      ipcRenderer.on("connection:endpointHealth", listener);
      return () => {
        ipcRenderer.removeListener("connection:endpointHealth", listener);
      };
    },
    notifyNetworkChanged: (online: boolean) => {
      ipcRenderer.send("connection:networkChanged", online);
    },
  },

  tailscalePeers: () =>
    ipcRenderer.invoke("tailscale:peers") as Promise<TailscalePeersResponse>,

  opencode: {
    getStatus: (environmentId: string) =>
      ipcRenderer.invoke("opencode:getStatus", environmentId) as Promise<OpenCodeConnectionStatus>,
    refreshStatus: (environmentId: string) =>
      ipcRenderer.invoke("opencode:refreshStatus", environmentId) as Promise<OpenCodeConnectionStatus>,
    onStatusChange: (cb: (environmentId: string, status: OpenCodeConnectionStatus) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        environmentId: string,
        status: OpenCodeConnectionStatus,
      ): void => {
        cb(environmentId, status);
      };
      ipcRenderer.on("opencode:status", listener);
      return () => {
        ipcRenderer.removeListener("opencode:status", listener);
      };
    },
  },

  vmWizard: {
    listSshHosts: () =>
      ipcRenderer.invoke("vmWizard:listSshHosts") as Promise<SshHost[]>,
    startWizard: (options: VmWizardStartOptions) =>
      ipcRenderer.invoke("vmWizard:start", options) as Promise<VmWizardResult>,
    onProgress: (cb: (progress: VmWizardProgress) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        progress: VmWizardProgress,
      ): void => {
        cb(progress);
      };
      ipcRenderer.on("vmWizard:progress", listener);
      return () => {
        ipcRenderer.removeListener("vmWizard:progress", listener);
      };
    },
    cancelWizard: () =>
      ipcRenderer.invoke("vmWizard:cancel") as Promise<void>,
    respondConsent: (decision: "install" | "skip") =>
      ipcRenderer.invoke("vmWizard:respondConsent", decision) as Promise<void>,
    respondServiceSelection: (selection: VmWizardServiceSelection) =>
      ipcRenderer.invoke("vmWizard:respondServiceSelection", selection) as Promise<void>,
    respondRuntimeConsent: (decision: "install" | "skip") =>
      ipcRenderer.invoke("vmWizard:respondRuntimeConsent", decision) as Promise<void>,
    respondHostKey: (accepted: boolean) =>
      ipcRenderer.invoke("vmWizard:respondHostKey", accepted) as Promise<void>,
  },

  infra: {
    executeAction: (args: InfraActionArgs) =>
      ipcRenderer.invoke("infra:executeAction", args) as Promise<InfraActionResult>,
    getStatus: () =>
      ipcRenderer.invoke("infra:getStatus") as Promise<{ mainVmId: string | null; connected: boolean }>,
    getPlatform: (environmentId: string, projectId: string) =>
      ipcRenderer.invoke("infra:getPlatform", environmentId, projectId) as Promise<PlatformType>,
  },

  budget: {
    getWatches: () =>
      ipcRenderer.invoke("budget:getWatches") as Promise<BudgetWatch[]>,
    addWatch: (watch: Omit<BudgetWatch, "id" | "createdAt">) =>
      ipcRenderer.invoke("budget:addWatch", watch) as Promise<BudgetWatch>,
    removeWatch: (watchId: string) =>
      ipcRenderer.invoke("budget:removeWatch", watchId) as Promise<void>,
    updateWatch: (watchId: string, updates: Partial<Pick<BudgetWatch, "threshold" | "autoPause" | "enabled">>) =>
      ipcRenderer.invoke("budget:updateWatch", watchId, updates) as Promise<void>,
    getBreaches: () =>
      ipcRenderer.invoke("budget:getBreaches") as Promise<BudgetBreach[]>,
    addBreach: (breach: Omit<BudgetBreach, "id">) =>
      ipcRenderer.invoke("budget:addBreach", breach) as Promise<BudgetBreach>,
    dismissBreach: (breachId: string) =>
      ipcRenderer.invoke("budget:dismissBreach", breachId) as Promise<void>,
  },

  inbox: {
    getItems: () =>
      ipcRenderer.invoke("inbox:getItems") as Promise<InboxItem[]>,
    dismissItem: (itemId: string) =>
      ipcRenderer.invoke("inbox:dismissItem", itemId) as Promise<void>,
    queryFleet: (question: string) =>
      ipcRenderer.invoke("inbox:queryFleet", question) as Promise<InboxQueryResult>,
    resolveItem: (resolved: ResolvedInboxItem) =>
      ipcRenderer.invoke("inbox:resolveItem", resolved) as Promise<void>,
    getResolvedItems: () =>
      ipcRenderer.invoke("inbox:getResolvedItems") as Promise<ResolvedInboxItem[]>,
    pruneResolvedItems: () =>
      ipcRenderer.invoke("inbox:pruneResolvedItems") as Promise<void>,
  },

  watch: {
    getWatches: () =>
      ipcRenderer.invoke("watch:getWatches") as Promise<ConditionWatch[]>,
    addWatch: (watch: Omit<ConditionWatch, "id" | "createdAt" | "tripped" | "trippedAt">) =>
      ipcRenderer.invoke("watch:addWatch", watch) as Promise<ConditionWatch>,
    removeWatch: (watchId: string) =>
      ipcRenderer.invoke("watch:removeWatch", watchId) as Promise<void>,
    tripWatch: (watchId: string) =>
      ipcRenderer.invoke("watch:tripWatch", watchId) as Promise<void>,
  },

  notification: {
    send: (args: NotificationSendArgs) =>
      ipcRenderer.invoke("notification:send", args) as Promise<void>,
    setMuted: (muted: boolean) =>
      ipcRenderer.invoke("notification:setMuted", muted) as Promise<void>,
    isMuted: () =>
      ipcRenderer.invoke("notification:isMuted") as Promise<boolean>,
    onClick: (cb: (deepLink: DeepLinkTarget) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        deepLink: DeepLinkTarget,
      ): void => {
        cb(deepLink);
      };
      ipcRenderer.on("notification:navigate", listener);
      return () => {
        ipcRenderer.removeListener("notification:navigate", listener);
      };
    },
  },

  outage: {
    onEscalation: (cb: (event: OutageEscalation) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        event: OutageEscalation,
      ): void => {
        cb(event);
      };
      ipcRenderer.on("outage:escalation", listener);
      return () => {
        ipcRenderer.removeListener("outage:escalation", listener);
      };
    },
    onResolve: (cb: (environmentId: string) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        environmentId: string,
      ): void => {
        cb(environmentId);
      };
      ipcRenderer.on("outage:resolve", listener);
      return () => {
        ipcRenderer.removeListener("outage:resolve", listener);
      };
    },
    getEscalations: () =>
      ipcRenderer.invoke("outage:getEscalations") as Promise<OutageEscalation[]>,
  },

  reachability: {
    getStatus: (environmentId: string) =>
      ipcRenderer.invoke("reachability:getStatus", environmentId) as Promise<ReachabilityStatus | null>,
    getAll: () =>
      ipcRenderer.invoke("reachability:getAll") as Promise<ReachabilityStatus[]>,
    onStatusChange: (cb: (status: ReachabilityStatus) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        status: ReachabilityStatus,
      ): void => {
        cb(status);
      };
      ipcRenderer.on("reachability:status", listener);
      return () => {
        ipcRenderer.removeListener("reachability:status", listener);
      };
    },
  },

  transcript: {
    getMessages: (sessionId: string) =>
      ipcRenderer.invoke("transcript:getMessages", sessionId) as Promise<TranscriptMessage[]>,
    appendMessage: (message: Omit<TranscriptMessage, "createdAt">) =>
      ipcRenderer.invoke("transcript:appendMessage", message) as Promise<TranscriptMessage>,
    appendMessages: (messages: Array<Omit<TranscriptMessage, "createdAt">>) =>
      ipcRenderer.invoke("transcript:appendMessages", messages) as Promise<TranscriptMessage[]>,
    updateMessage: (messageId: string, updates: Partial<Pick<TranscriptMessage, "content" | "toolCalls" | "finishedAt">>) =>
      ipcRenderer.invoke("transcript:updateMessage", messageId, updates) as Promise<void>,
    deleteSession: (sessionId: string) =>
      ipcRenderer.invoke("transcript:deleteSession", sessionId) as Promise<void>,
  },

  mcp: {
    getStatus: (environmentId: string) =>
      ipcRenderer.invoke("mcp:getStatus", environmentId) as Promise<McpConnectionStatus>,
    connect: (environmentId: string) =>
      ipcRenderer.invoke("mcp:connect", environmentId) as Promise<McpConnectionStatus>,
    disconnect: (environmentId: string) =>
      ipcRenderer.invoke("mcp:disconnect", environmentId) as Promise<void>,
    callTool: (environmentId: string, toolName: string, args: Record<string, unknown>) =>
      ipcRenderer.invoke("mcp:callTool", environmentId, toolName, args) as Promise<McpToolCallResult>,
    onStatusChange: (cb: (status: McpConnectionStatus) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        status: McpConnectionStatus,
      ): void => {
        cb(status);
      };
      ipcRenderer.on("mcp:status", listener);
      return () => {
        ipcRenderer.removeListener("mcp:status", listener);
      };
    },
  },

  agent: {
    sendPrompt: (args: AgentSendPromptArgs) =>
      ipcRenderer.invoke("agent:sendPrompt", args) as Promise<AgentSendPromptResult>,
    interrupt: (environmentId: string, sessionId?: string) =>
      ipcRenderer.invoke("agent:interrupt", environmentId, sessionId) as Promise<void>,
    onStreamEvent: (cb: (event: AgentStreamEvent) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        streamEvent: AgentStreamEvent,
      ): void => {
        cb(streamEvent);
      };
      ipcRenderer.on("agent:streamEvent", listener);
      return () => {
        ipcRenderer.removeListener("agent:streamEvent", listener);
      };
    },
    listModels: (environmentId: string) =>
      ipcRenderer.invoke("agent:listModels", environmentId) as Promise<ListModelsResult>,
  },

  loopShapeCache: {
    getCached: (environmentId: string) =>
      ipcRenderer.invoke("loopShapeCache:getCached", environmentId) as Promise<LoopShape[]>,
    getAll: () =>
      ipcRenderer.invoke("loopShapeCache:getAll") as Promise<LoopShape[]>,
    refresh: (environmentId: string) =>
      ipcRenderer.invoke("loopShapeCache:refresh", environmentId) as Promise<LoopShape[]>,
    onUpdate: (cb: (shapes: LoopShape[]) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        shapes: LoopShape[],
      ): void => {
        cb(shapes);
      };
      ipcRenderer.on("loopShapeCache:update", listener);
      return () => {
        ipcRenderer.removeListener("loopShapeCache:update", listener);
      };
    },
  },

  siblingDecline: {
    isDeclined: (environmentId: string, loopId: string, fingerprint: string) =>
      ipcRenderer.invoke("siblingDecline:isDeclined", environmentId, loopId, fingerprint) as Promise<boolean>,
    recordDecline: (record: { environmentId: string; loopId: string; fingerprint: string }) =>
      ipcRenderer.invoke("siblingDecline:recordDecline", record) as Promise<void>,
  },

  settings: {
    getSettings: () =>
      ipcRenderer.invoke("settings:get") as Promise<GlobalSettings>,
    updateSettings: (updates: Partial<GlobalSettings>) =>
      ipcRenderer.invoke("settings:update", updates) as Promise<void>,
  },
};

contextBridge.exposeInMainWorld("api", bridge);
