import { useCallback, useEffect, useMemo, useState } from "react";
import { cid, useInject } from "inversify-hooks";
import type { Environment, OpenCodeEndpoint, AccessEndpoint } from "./types";
import type { EndpointKind } from "../../shared/ipc";
import type { IConfigService } from "./services/interfaces";

export function useEnvironments(): {
  environments: Environment[];
  selectedId: string | null;
  mainVm: Environment | null;
  select: (id: string | null) => void;
  add: (name: string, baseUrl: string, kind?: EndpointKind) => Promise<Environment>;
  remove: (id: string) => void;
  addEndpoint: (environmentId: string, url: string, kind: EndpointKind) => void;
  removeEndpoint: (environmentId: string, endpointId: string) => void;
  setActiveEndpoint: (environmentId: string, endpointId: string) => void;
  removeSessionToken: (environmentId: string) => void;
  setOpenCodeEndpoint: (environmentId: string, url: string, password: string | null) => void;
  setMainVm: (environmentId: string) => void;
  reload: () => Promise<void>;
} {
  const [configService] = useInject<IConfigService>(cid.IConfigService);
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
      setSelectedId(loadedId);
      setLoaded(true);
    };

    void migrateAndLoad();
  }, [configService]);

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      void configService.setSelectedEnvironmentId(id).catch(() => {});
    },
    [configService],
  );

  const add = useCallback(async (name: string, baseUrl: string, kind?: EndpointKind): Promise<Environment> => {
    const trimmedUrl = baseUrl.trim().replace(/\/+$/, "");
    const env = await configService.addEnvironment(name, trimmedUrl, kind);
    setEnvironments(await configService.getEnvironments());
    return env;
  }, [configService]);

  const remove = useCallback(
    (id: string) => {
      void configService.removeEnvironment(id).then(async () => {
        setEnvironments(await configService.getEnvironments());
        setSelectedId(await configService.getSelectedEnvironmentId());
      }).catch(() => {});
    },
    [configService],
  );

  const addEndpointFn = useCallback(
    (environmentId: string, url: string, kind: EndpointKind) => {
      void configService.addEndpoint(environmentId, url, kind).then(async () => {
        setEnvironments(await configService.getEnvironments());
      }).catch(() => {});
    },
    [configService],
  );

  const removeEndpointFn = useCallback(
    (environmentId: string, endpointId: string) => {
      void configService.removeEndpoint(environmentId, endpointId).then(async () => {
        setEnvironments(await configService.getEnvironments());
      }).catch(() => {});
    },
    [configService],
  );

  const setActiveEndpointFn = useCallback(
    (environmentId: string, endpointId: string) => {
      void configService.setActiveEndpoint(environmentId, endpointId).then(async () => {
        setEnvironments(await configService.getEnvironments());
      }).catch(() => {});
    },
    [configService],
  );

  const removeSessionTokenFn = useCallback(
    (environmentId: string) => {
      void configService.removeSessionToken(environmentId).then(async () => {
        setEnvironments(await configService.getEnvironments());
      }).catch(() => {});
    },
    [configService],
  );

  const setOpenCodeEndpointFn = useCallback(
    (environmentId: string, url: string, password: string | null) => {
      const endpoint: OpenCodeEndpoint = { url: url.trim().replace(/\/+$/, ""), password };
      void configService.setOpenCodeEndpoint(environmentId, endpoint).then(async (result) => {
        if (result.ok) {
          setEnvironments(await configService.getEnvironments());
        }
        // If !result.ok, the main process already showed a dialog — nothing to do here
      }).catch(() => {});
    },
    [configService],
  );

  const setMainVmFn = useCallback(
    (environmentId: string) => {
      void configService.setMainVm(environmentId).then(async () => {
        setEnvironments(await configService.getEnvironments());
      }).catch(() => {});
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
    select,
    add,
    remove,
    addEndpoint: addEndpointFn,
    removeEndpoint: removeEndpointFn,
    setActiveEndpoint: setActiveEndpointFn,
    removeSessionToken: removeSessionTokenFn,
    setOpenCodeEndpoint: setOpenCodeEndpointFn,
    setMainVm: setMainVmFn,
    reload: reloadFn,
  };

  if (!loaded) {
    return { ...result, environments: [], selectedId: null, mainVm: null };
  }

  return result;
}
