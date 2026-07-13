import { contextBridge, ipcRenderer } from "electron";
import type {
  ApiRequestArgs,
  ConnectionStatus,
  EndpointHealth,
  StreamSubscribeArgs,
  StreamEventPayload,
  TailscalePeersResponse,
  LoopTaskBridge,
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
};

contextBridge.exposeInMainWorld("api", bridge);
