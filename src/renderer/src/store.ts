import { useCallback, useEffect, useMemo, useState } from "react";
import { cid, useInject } from "inversify-hooks";
import type { Environment, OpenCodeEndpoint } from "./types";
import type { EndpointKind } from "../../shared/ipc";
import { trimTrailingSlash } from "../../shared/utils";
import type { IConfigService, ILogService } from "./services/interfaces";

/**
 * Shared error handler for config CRUD operations.
 * Logs the operation name and error details so IPC-layer failures are
 * visible in the developer console, and dispatches a custom event so
 * the UI can surface the failure to the user (e.g. via a toast/alert).
 */
function handleConfigError(logService: ILogService, operation: string, error: unknown): void {
  logService.error(`Config service ${operation} failed`, {
    error: error instanceof Error ? error.message : String(error),
  });
  try {
    window.dispatchEvent(
      new CustomEvent("orbion:config-error", {
        detail: { operation, error: error instanceof Error ? error.message : String(error) },
      }),
    );
  } catch {
    // dispatchEvent must not throw — if it does, just log and move on
  }
}

export function useEnvironments(): {
  environments: Environment[];
  selectedId: string | null;
  mainVm: Environment | null;
  loaded: boolean;
  select: (id: string | null) => void;
  add: (name: string, baseUrl: string, kind?: EndpointKind) => Promise<Environment>;
  remove: (id: string) => void;
  update: (id: string, updates: { name?: string; agentRuntime?: import("../../../shared/ipc").AgentRuntime }) => void;
  addEndpoint: (environmentId: string, url: string, kind: EndpointKind) => void;
  removeEndpoint: (environmentId: string, endpointId: string) => void;
  setActiveEndpoint: (environmentId: string, endpointId: string) => void;
  removeSessionToken: (environmentId: string) => void;
  setOpenCodeEndpoint: (environmentId: string, url: string, password: string | null) => void;
  setMainVm: (environmentId: string) => void;
  /** Stamp-checked set-main-VM: returns a StaleConfigResult if config was modified elsewhere. */
  stampCheckedSetMainVm: (environmentId: string) => Promise<import("../../../shared/ipc").StampCheckedWriteResult>;
  /** Force-write the main-VM designate regardless of staleness. */
  forceSetMainVm: (environmentId: string) => Promise<void>;
  reload: () => Promise<void>;
} {
  const [configService] = useInject<IConfigService>(cid.IConfigService);
  const [logService] = useInject<ILogService>(cid.ILogService);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const mainVm = useMemo(() => environments.find((e) => e.role === "main-vm") ?? null, [environments]);

  useEffect(() => {
    const migrateAndLoad = async (): Promise<void> => {
      const rawInstances = localStorage.getItem("lta.instances.v1");
      if (rawInstances) {
        const rawSelectedId = localStorage.getItem("lta.selectedInstance.v1");
        await configService.migrateFromLocalStorage(rawInstances, rawSelectedId);
        localStorage.removeItem("lta.instances.v1");
        localStorage.removeItem("lta.selectedInstance.v1");
      }

      const [loadedEnvs, loadedId] = await Promise.all([
        configService.getEnvironments(),
        configService.getSelectedEnvironmentId(),
      ]);
      setEnvironments(loadedEnvs);
      // If no environment is selected but environments exist, auto-select the main VM
      // (or the first environment) so the app doesn't show an empty cold-open screen
      // with environments hiding in the sidebar.
      let finalId = loadedId;
      if (!finalId && loadedEnvs.length > 0) {
        const mainVm = loadedEnvs.find((e) => e.role === "main-vm") ?? loadedEnvs[0];
        finalId = mainVm.id;
        void configService.setSelectedEnvironmentId(finalId);
      }
      setSelectedId(finalId);
      setLoaded(true);
    };

    void migrateAndLoad();
  }, [configService]);

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      void configService.setSelectedEnvironmentId(id).catch((err) => handleConfigError(logService, "setSelectedEnvironmentId", err));
    },
    [configService, logService],
  );

  const add = useCallback(async (name: string, baseUrl: string, kind?: EndpointKind): Promise<Environment> => {
    const trimmedUrl = trimTrailingSlash(baseUrl.trim());
    const env = await configService.addEnvironment(name, trimmedUrl, kind);
    setEnvironments(await configService.getEnvironments());
    return env;
  }, [configService]);

  const remove = useCallback(
    (id: string) => {
      void configService.removeEnvironment(id).then(async () => {
        setEnvironments(await configService.getEnvironments());
        setSelectedId(await configService.getSelectedEnvironmentId());
      }).catch((err) => handleConfigError(logService, "removeEnvironment", err));
    },
    [configService, logService],
  );

  const updateFn = useCallback(
    (id: string, updates: { name?: string; agentRuntime?: import("../../../shared/ipc").AgentRuntime }) => {
      void configService.updateEnvironment(id, updates).then(async () => {
        setEnvironments(await configService.getEnvironments());
      }).catch((err) => handleConfigError(logService, "updateEnvironment", err));
    },
    [configService, logService],
  );

  const addEndpointFn = useCallback(
    (environmentId: string, url: string, kind: EndpointKind) => {
      void configService.addEndpoint(environmentId, url, kind).then(async () => {
        setEnvironments(await configService.getEnvironments());
      }).catch((err) => handleConfigError(logService, "addEndpoint", err));
    },
    [configService, logService],
  );

  const removeEndpointFn = useCallback(
    (environmentId: string, endpointId: string) => {
      void configService.removeEndpoint(environmentId, endpointId).then(async () => {
        setEnvironments(await configService.getEnvironments());
      }).catch((err) => handleConfigError(logService, "removeEndpoint", err));
    },
    [configService, logService],
  );

  const setActiveEndpointFn = useCallback(
    (environmentId: string, endpointId: string) => {
      void configService.setActiveEndpoint(environmentId, endpointId).then(async () => {
        setEnvironments(await configService.getEnvironments());
      }).catch((err) => handleConfigError(logService, "setActiveEndpoint", err));
    },
    [configService, logService],
  );

  const removeSessionTokenFn = useCallback(
    (environmentId: string) => {
      void configService.removeSessionToken(environmentId).then(async () => {
        setEnvironments(await configService.getEnvironments());
      }).catch((err) => handleConfigError(logService, "removeSessionToken", err));
    },
    [configService, logService],
  );

  const setOpenCodeEndpointFn = useCallback(
    (environmentId: string, url: string, password: string | null) => {
      const endpoint: OpenCodeEndpoint = { url: trimTrailingSlash(url.trim()), password };
      void configService.setOpenCodeEndpoint(environmentId, endpoint).then(async (result) => {
        if (result.ok) {
          setEnvironments(await configService.getEnvironments());
        } else {
          handleConfigError(logService, "setOpenCodeEndpoint", `operation rejected: ${result.reason}`);
        }
      }).catch((err) => handleConfigError(logService, "setOpenCodeEndpoint", err));
    },
    [configService, logService],
  );

  const setMainVmFn = useCallback(
    (environmentId: string) => {
      void configService.setMainVm(environmentId).then(async () => {
        setEnvironments(await configService.getEnvironments());
      }).catch((err) => handleConfigError(logService, "setMainVm", err));
    },
    [configService, logService],
  );

  const stampCheckedSetMainVmFn = useCallback(
    async (environmentId: string): Promise<import("../../../shared/ipc").StampCheckedWriteResult> => {
      const stamp = await configService.getConfigStamp();
      const result = await configService.stampCheckedSetMainVm(environmentId, stamp);
      if (result.ok) {
        setEnvironments(await configService.getEnvironments());
      }
      return result;
    },
    [configService],
  );

  const forceSetMainVmFn = useCallback(
    async (environmentId: string): Promise<void> => {
      await configService.forceSetMainVm(environmentId);
      setEnvironments(await configService.getEnvironments());
    },
    [configService],
  );

  const reloadFn = useCallback(async () => {
    const [envs, sid] = await Promise.all([
      configService.getEnvironments(),
      configService.getSelectedEnvironmentId(),
    ]);
    setEnvironments(envs);
    setSelectedId(sid);
  }, [configService]);

  const result = {
    environments,
    selectedId,
    mainVm,
    loaded,
    select,
    add,
    remove,
    update: updateFn,
    addEndpoint: addEndpointFn,
    removeEndpoint: removeEndpointFn,
    setActiveEndpoint: setActiveEndpointFn,
    removeSessionToken: removeSessionTokenFn,
    setOpenCodeEndpoint: setOpenCodeEndpointFn,
    setMainVm: setMainVmFn,
    stampCheckedSetMainVm: stampCheckedSetMainVmFn,
    forceSetMainVm: forceSetMainVmFn,
    reload: reloadFn,
  };

  if (!loaded) {
    return { ...result, environments: [], selectedId: null, mainVm: null };
  }

  return result;
}
