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
    startWizard: (target: string, name?: string) =>
      ipcRenderer.invoke("vmWizard:start", target, name) as Promise<VmWizardResult>,
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
};

contextBridge.exposeInMainWorld("api", bridge);
