import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/ipc-channels.js";
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
  SecurityAuditEvent,
  EndpointKind,
  AgentRuntime,
} from "../shared/ipc.js";
import type { LogEntry } from "../shared/log.js";

const bridge: LoopTaskBridge = {
  request: (args: ApiRequestArgs) => ipcRenderer.invoke(IPC_CHANNELS.API_REQUEST, args),

  subscribeStream: (args: StreamSubscribeArgs) =>
    ipcRenderer.invoke(IPC_CHANNELS.STREAM_SUBSCRIBE, args),

  unsubscribeStream: (subId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.STREAM_UNSUBSCRIBE, subId),

  onStreamEvent: (cb: (payload: StreamEventPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: StreamEventPayload): void => {
      cb(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.STREAM_EVENT, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.STREAM_EVENT, listener);
    };
  },

  config: {
    getEnvironments: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET_ENVIRONMENTS),
    addEnvironment: (name: string, url: string, kind?: EndpointKind) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_ADD_ENVIRONMENT, name, url, kind),
    removeEnvironment: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_REMOVE_ENVIRONMENT, id),
    updateEnvironment: (id: string, updates: { name?: string; agentRuntime?: AgentRuntime; sshControlTarget?: string | null }) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_UPDATE_ENVIRONMENT, id, updates) as Promise<void>,
    addEndpoint: (environmentId: string, url: string, kind: EndpointKind) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_ADD_ENDPOINT, environmentId, url, kind),
    removeEndpoint: (environmentId: string, endpointId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_REMOVE_ENDPOINT, environmentId, endpointId),
    setActiveEndpoint: (environmentId: string, endpointId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET_ACTIVE_ENDPOINT, environmentId, endpointId),
    getSelectedEnvironmentId: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET_SELECTED_ENVIRONMENT_ID),
    setSelectedEnvironmentId: (id: string | null) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET_SELECTED_ENVIRONMENT_ID, id),
    migrateFromLocalStorage: (rawInstances: string, rawSelectedId: string | null) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_MIGRATE_FROM_LOCAL_STORAGE, rawInstances, rawSelectedId),
    exchangePairingCode: (baseUrl: string, code: string, scope?: SessionScope) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_EXCHANGE_PAIRING_CODE, baseUrl, code, scope) as Promise<PairingCodeExchangeResponse>,
    removeSessionToken: (environmentId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_REMOVE_SESSION_TOKEN, environmentId),
    setOpenCodeEndpoint: (environmentId: string, endpoint: OpenCodeEndpoint | null) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET_OPENCODE_ENDPOINT, environmentId, endpoint) as Promise<SetOpenCodeEndpointResult>,
    setInfraOpenCodeEndpoint: (environmentId: string, endpoint: OpenCodeEndpoint | null) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET_INFRA_OPENCODE_ENDPOINT, environmentId, endpoint) as Promise<SetOpenCodeEndpointResult>,
    setMainVm: (environmentId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET_MAIN_VM, environmentId) as Promise<void>,
    getMainVmId: () =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET_MAIN_VM_ID) as Promise<string | null>,
    getProjectPickupLabels: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET_PROJECT_PICKUP_LABELS, projectId) as Promise<string[]>,
    setProjectPickupLabels: (projectId: string, labels: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET_PROJECT_PICKUP_LABELS, projectId, labels) as Promise<void>,
    getProjectPipelineLabels: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET_PROJECT_PIPELINE_LABELS, projectId) as Promise<string[]>,
    setProjectPipelineLabels: (projectId: string, labels: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET_PROJECT_PIPELINE_LABELS, projectId, labels) as Promise<void>,
    getChatSessions: () =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET_CHAT_SESSIONS) as Promise<ChatSession[]>,
    addChatSession: (session: Omit<ChatSession, "id" | "createdAt">) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_ADD_CHAT_SESSION, session) as Promise<ChatSession>,
    removeChatSession: (sessionId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_REMOVE_CHAT_SESSION, sessionId) as Promise<void>,
    updateChatSession: (sessionId: string, updates: Partial<Pick<ChatSession, "title" | "lastActiveAt" | "projectName" | "environmentId" | "workingDirectory" | "activeRuntime" | "activeModel" | "reasoningEffort" | "persisted" | "turnCount" | "declineAutoPersistUntil" | "pinned">>) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_UPDATE_CHAT_SESSION, sessionId, updates) as Promise<void>,
    pinChatSession: (sessionId: string, pinned: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_PIN_CHAT_SESSION, sessionId, pinned) as Promise<void>,
    renameChatSession: (sessionId: string, title: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_RENAME_CHAT_SESSION, sessionId, title) as Promise<void>,
    reorderChatSessions: (orderedSessionIds: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_REORDER_CHAT_SESSIONS, orderedSessionIds) as Promise<void>,
    getExpandedProjects: () =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET_EXPANDED_PROJECTS) as Promise<string[]>,
    setExpandedProjects: (expandedKeys: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET_EXPANDED_PROJECTS, expandedKeys) as Promise<void>,
    exportBootstrapSeed: () =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_EXPORT_BOOTSTRAP_SEED) as Promise<BootstrapSeedExportResult>,
    importBootstrapSeed: (seedString: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_IMPORT_BOOTSTRAP_SEED, seedString) as Promise<BootstrapSeedImportResult>,
    checkRestoreAvailable: () =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_CHECK_RESTORE_AVAILABLE) as Promise<RestoreAvailability>,
    pullRestore: () =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_PULL_RESTORE) as Promise<PullRestoreResult>,
    getConfigStamp: () =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET_STAMP) as Promise<ConfigStamp>,
    stampCheckedSetMainVm: (environmentId: string, knownStamp: ConfigStamp) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_STAMP_CHECKED_SET_MAIN_VM, environmentId, knownStamp) as Promise<StampCheckedWriteResult>,
    forceSetMainVm: (environmentId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_FORCE_SET_MAIN_VM, environmentId) as Promise<ConfigStamp>,
    sweepEphemeralSessions: (args: SweepEphemeralSessionsArgs) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SWEEP_EPHEMERAL_SESSIONS, args) as Promise<SweepEphemeralSessionsResult>,
  },

  connection: {
    getStatus: (environmentId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_GET_STATUS, environmentId) as Promise<ConnectionStatus | null>,
    getEndpointHealth: (environmentId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_GET_ENDPOINT_HEALTH, environmentId) as Promise<EndpointHealth[]>,
    retry: (environmentId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_RETRY, environmentId) as Promise<void>,
    onStatusChange: (cb: (environmentId: string, status: ConnectionStatus) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        environmentId: string,
        status: ConnectionStatus,
      ): void => {
        cb(environmentId, status);
      };
      ipcRenderer.on(IPC_CHANNELS.CONNECTION_STATUS, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.CONNECTION_STATUS, listener);
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
      ipcRenderer.on(IPC_CHANNELS.CONNECTION_ENDPOINT_HEALTH, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.CONNECTION_ENDPOINT_HEALTH, listener);
      };
    },
    notifyNetworkChanged: (online: boolean) => {
      ipcRenderer.send(IPC_CHANNELS.CONNECTION_NETWORK_CHANGED, online);
    },
  },

  tailscalePeers: () =>
    ipcRenderer.invoke(IPC_CHANNELS.TAILSCALE_PEERS) as Promise<TailscalePeersResponse>,

  opencode: {
    getStatus: (environmentId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.OPENCODE_GET_STATUS, environmentId) as Promise<OpenCodeConnectionStatus>,
    refreshStatus: (environmentId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.OPENCODE_REFRESH_STATUS, environmentId) as Promise<OpenCodeConnectionStatus>,
    onStatusChange: (cb: (environmentId: string, status: OpenCodeConnectionStatus) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        environmentId: string,
        status: OpenCodeConnectionStatus,
      ): void => {
        cb(environmentId, status);
      };
      ipcRenderer.on(IPC_CHANNELS.OPENCODE_STATUS, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.OPENCODE_STATUS, listener);
      };
    },
  },

  vmWizard: {
    listSshHosts: () =>
      ipcRenderer.invoke(IPC_CHANNELS.VM_WIZARD_LIST_SSH_HOSTS) as Promise<SshHost[]>,
    startWizard: (options: VmWizardStartOptions) =>
      ipcRenderer.invoke(IPC_CHANNELS.VM_WIZARD_START, options) as Promise<VmWizardResult>,
    onProgress: (cb: (progress: VmWizardProgress) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        progress: VmWizardProgress,
      ): void => {
        cb(progress);
      };
      ipcRenderer.on(IPC_CHANNELS.VM_WIZARD_PROGRESS, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.VM_WIZARD_PROGRESS, listener);
      };
    },
    cancelWizard: () =>
      ipcRenderer.invoke(IPC_CHANNELS.VM_WIZARD_CANCEL) as Promise<void>,
    respondConsent: (decision: "install" | "skip") =>
      ipcRenderer.invoke(IPC_CHANNELS.VM_WIZARD_RESPOND_CONSENT, decision) as Promise<void>,
    respondServiceSelection: (selection: VmWizardServiceSelection) =>
      ipcRenderer.invoke(IPC_CHANNELS.VM_WIZARD_RESPOND_SERVICE_SELECTION, selection) as Promise<void>,
    respondRuntimeConsent: (decision: "install" | "skip") =>
      ipcRenderer.invoke(IPC_CHANNELS.VM_WIZARD_RESPOND_RUNTIME_CONSENT, decision) as Promise<void>,
    respondHostKey: (accepted: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.VM_WIZARD_RESPOND_HOST_KEY, accepted) as Promise<void>,
  },

  infra: {
    executeAction: (args: InfraActionArgs) =>
      ipcRenderer.invoke(IPC_CHANNELS.INFRA_EXECUTE_ACTION, args) as Promise<InfraActionResult>,
    getStatus: () =>
      ipcRenderer.invoke(IPC_CHANNELS.INFRA_GET_STATUS) as Promise<{ mainVmId: string | null; connected: boolean }>,
    getPlatform: (environmentId: string, projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.INFRA_GET_PLATFORM, environmentId, projectId) as Promise<PlatformType>,
  },

  budget: {
    getWatches: () =>
      ipcRenderer.invoke(IPC_CHANNELS.BUDGET_GET_WATCHES) as Promise<BudgetWatch[]>,
    addWatch: (watch: Omit<BudgetWatch, "id" | "createdAt">) =>
      ipcRenderer.invoke(IPC_CHANNELS.BUDGET_ADD_WATCH, watch) as Promise<BudgetWatch>,
    removeWatch: (watchId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BUDGET_REMOVE_WATCH, watchId) as Promise<void>,
    updateWatch: (watchId: string, updates: Partial<Pick<BudgetWatch, "threshold" | "autoPause" | "enabled">>) =>
      ipcRenderer.invoke(IPC_CHANNELS.BUDGET_UPDATE_WATCH, watchId, updates) as Promise<void>,
    getBreaches: () =>
      ipcRenderer.invoke(IPC_CHANNELS.BUDGET_GET_BREACHES) as Promise<BudgetBreach[]>,
    addBreach: (breach: Omit<BudgetBreach, "id">) =>
      ipcRenderer.invoke(IPC_CHANNELS.BUDGET_ADD_BREACH, breach) as Promise<BudgetBreach>,
    dismissBreach: (breachId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BUDGET_DISMISS_BREACH, breachId) as Promise<void>,
  },

  inbox: {
    getItems: () =>
      ipcRenderer.invoke(IPC_CHANNELS.INBOX_GET_ITEMS) as Promise<InboxItem[]>,
    getDismissedIds: () =>
      ipcRenderer.invoke(IPC_CHANNELS.INBOX_GET_DISMISSED_IDS) as Promise<string[]>,
    dismissItem: (itemId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.INBOX_DISMISS_ITEM, itemId) as Promise<void>,
    queryFleet: (question: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.INBOX_QUERY_FLEET, question) as Promise<InboxQueryResult>,
    resolveItem: (resolved: ResolvedInboxItem) =>
      ipcRenderer.invoke(IPC_CHANNELS.INBOX_RESOLVE_ITEM, resolved) as Promise<void>,
    getResolvedItems: () =>
      ipcRenderer.invoke(IPC_CHANNELS.INBOX_GET_RESOLVED_ITEMS) as Promise<ResolvedInboxItem[]>,
    pruneResolvedItems: () =>
      ipcRenderer.invoke(IPC_CHANNELS.INBOX_PRUNE_RESOLVED_ITEMS) as Promise<void>,
  },

  watch: {
    getWatches: () =>
      ipcRenderer.invoke(IPC_CHANNELS.WATCH_GET_WATCHES) as Promise<ConditionWatch[]>,
    addWatch: (watch: Omit<ConditionWatch, "id" | "createdAt" | "tripped" | "trippedAt">) =>
      ipcRenderer.invoke(IPC_CHANNELS.WATCH_ADD_WATCH, watch) as Promise<ConditionWatch>,
    removeWatch: (watchId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WATCH_REMOVE_WATCH, watchId) as Promise<void>,
    tripWatch: (watchId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WATCH_TRIP_WATCH, watchId) as Promise<void>,
  },

  notification: {
    send: (args: NotificationSendArgs) =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_SEND, args) as Promise<void>,
    setMuted: (muted: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_SET_MUTED, muted) as Promise<void>,
    isMuted: () =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_IS_MUTED) as Promise<boolean>,
    onClick: (cb: (deepLink: DeepLinkTarget) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        deepLink: DeepLinkTarget,
      ): void => {
        cb(deepLink);
      };
      ipcRenderer.on(IPC_CHANNELS.NOTIFICATION_NAVIGATE, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.NOTIFICATION_NAVIGATE, listener);
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
      ipcRenderer.on(IPC_CHANNELS.OUTAGE_ESCALATION, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.OUTAGE_ESCALATION, listener);
      };
    },
    onResolve: (cb: (environmentId: string) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        environmentId: string,
      ): void => {
        cb(environmentId);
      };
      ipcRenderer.on(IPC_CHANNELS.OUTAGE_RESOLVE, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.OUTAGE_RESOLVE, listener);
      };
    },
    getEscalations: () =>
      ipcRenderer.invoke(IPC_CHANNELS.OUTAGE_GET_ESCALATIONS) as Promise<OutageEscalation[]>,
  },

  reachability: {
    getStatus: (environmentId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.REACHABILITY_GET_STATUS, environmentId) as Promise<ReachabilityStatus | null>,
    getAll: () =>
      ipcRenderer.invoke(IPC_CHANNELS.REACHABILITY_GET_ALL) as Promise<ReachabilityStatus[]>,
    onStatusChange: (cb: (status: ReachabilityStatus) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        status: ReachabilityStatus,
      ): void => {
        cb(status);
      };
      ipcRenderer.on(IPC_CHANNELS.REACHABILITY_STATUS, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.REACHABILITY_STATUS, listener);
      };
    },
  },

  transcript: {
    getMessages: (sessionId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TRANSCRIPT_GET_MESSAGES, sessionId) as Promise<TranscriptMessage[]>,
    appendMessage: (message: Omit<TranscriptMessage, "createdAt">) =>
      ipcRenderer.invoke(IPC_CHANNELS.TRANSCRIPT_APPEND_MESSAGE, message) as Promise<TranscriptMessage>,
    appendMessages: (messages: Array<Omit<TranscriptMessage, "createdAt">>) =>
      ipcRenderer.invoke(IPC_CHANNELS.TRANSCRIPT_APPEND_MESSAGES, messages) as Promise<TranscriptMessage[]>,
    updateMessage: (messageId: string, updates: Partial<Pick<TranscriptMessage, "content" | "toolCalls" | "finishedAt">>) =>
      ipcRenderer.invoke(IPC_CHANNELS.TRANSCRIPT_UPDATE_MESSAGE, messageId, updates) as Promise<void>,
    deleteSession: (sessionId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TRANSCRIPT_DELETE_SESSION, sessionId) as Promise<void>,
  },

  mcp: {
    getStatus: (environmentId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.MCP_GET_STATUS, environmentId) as Promise<McpConnectionStatus>,
    connect: (environmentId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.MCP_CONNECT, environmentId) as Promise<McpConnectionStatus>,
    disconnect: (environmentId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.MCP_DISCONNECT, environmentId) as Promise<void>,
    callTool: (environmentId: string, toolName: string, args: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC_CHANNELS.MCP_CALL_TOOL, environmentId, toolName, args) as Promise<McpToolCallResult>,
    onStatusChange: (cb: (status: McpConnectionStatus) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        status: McpConnectionStatus,
      ): void => {
        cb(status);
      };
      ipcRenderer.on(IPC_CHANNELS.MCP_STATUS, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.MCP_STATUS, listener);
      };
    },
  },

  agent: {
    sendPrompt: (args: AgentSendPromptArgs) =>
      ipcRenderer.invoke(IPC_CHANNELS.AGENT_SEND_PROMPT, args) as Promise<AgentSendPromptResult>,
    interrupt: (environmentId: string, sessionId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AGENT_INTERRUPT, environmentId, sessionId) as Promise<void>,
    onStreamEvent: (cb: (event: AgentStreamEvent) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        streamEvent: AgentStreamEvent,
      ): void => {
        cb(streamEvent);
      };
      ipcRenderer.on(IPC_CHANNELS.AGENT_STREAM_EVENT, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.AGENT_STREAM_EVENT, listener);
      };
    },
    listModels: (environmentId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AGENT_LIST_MODELS, environmentId) as Promise<ListModelsResult>,
  },

  loopShapeCache: {
    getCached: (environmentId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.LOOP_SHAPE_CACHE_GET_CACHED, environmentId) as Promise<LoopShape[]>,
    getAll: () =>
      ipcRenderer.invoke(IPC_CHANNELS.LOOP_SHAPE_CACHE_GET_ALL) as Promise<LoopShape[]>,
    refresh: (environmentId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.LOOP_SHAPE_CACHE_REFRESH, environmentId) as Promise<LoopShape[]>,
    onUpdate: (cb: (shapes: LoopShape[]) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        shapes: LoopShape[],
      ): void => {
        cb(shapes);
      };
      ipcRenderer.on(IPC_CHANNELS.LOOP_SHAPE_CACHE_UPDATE, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.LOOP_SHAPE_CACHE_UPDATE, listener);
      };
    },
  },

  siblingDecline: {
    isDeclined: (environmentId: string, loopId: string, fingerprint: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SIBLING_DECLINE_IS_DECLINED, environmentId, loopId, fingerprint) as Promise<boolean>,
    recordDecline: (record: { environmentId: string; loopId: string; fingerprint: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.SIBLING_DECLINE_RECORD_DECLINE, record) as Promise<void>,
  },

  settings: {
    getSettings: () =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET) as Promise<GlobalSettings>,
    updateSettings: (updates: Partial<GlobalSettings>) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, updates) as Promise<void>,
  },

  log: {
    write: (entry: LogEntry) => {
      ipcRenderer.invoke(IPC_CHANNELS.LOG_WRITE, entry).catch(() => {});
    },
  },

  credential: {
    onTampered: (cb: (event: { environmentId: string; credentialKind: "sessionToken" | "sshKeyPassphrase" }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { environmentId: string; credentialKind: "sessionToken" | "sshKeyPassphrase" },
      ): void => {
        cb(payload);
      };
      ipcRenderer.on(IPC_CHANNELS.CREDENTIAL_TAMPERED, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.CREDENTIAL_TAMPERED, listener);
      };
    },
    getSecurityAuditEvents: () =>
      ipcRenderer.invoke(IPC_CHANNELS.CREDENTIAL_GET_SECURITY_AUDIT_EVENTS) as Promise<SecurityAuditEvent[]>,
  },
};

contextBridge.exposeInMainWorld("api", bridge);
