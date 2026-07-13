import { useCallback, useEffect, useState } from "react";
import type { Environment } from "./types";
import { apiRequest, resolveBaseUrl } from "./api";

async function probeUrl(url: string): Promise<boolean> {
  const probeEnv: Environment = {
    id: "probe",
    name: "probe",
    endpoints: [{ id: "probe-ep", kind: "direct" as const, url, lastError: null, failureCount: 0 }],
    activeEndpointId: "probe-ep",
  };
  const res = await apiRequest(probeEnv, "/api/loops");
  return res.ok;
}

export function useEnvironments(): {
  environments: Environment[];
  selectedId: string | null;
  select: (id: string | null) => void;
  add: (name: string, baseUrl: string, kind?: "direct" | "ssh" | "tailscale") => Promise<Environment>;
  remove: (id: string) => void;
  addEndpoint: (environmentId: string, url: string, kind: "direct" | "ssh" | "tailscale") => void;
  removeEndpoint: (environmentId: string, endpointId: string) => void;
  setActiveEndpoint: (environmentId: string, endpointId: string) => void;
} {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!window.api) {
      const raw = localStorage.getItem("lta.environments.v1");
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Environment[];
          if (Array.isArray(parsed)) setEnvironments(parsed);
        } catch { /* empty */ }
      } else {
        const legacyRaw = localStorage.getItem("lta.instances.v1");
        if (legacyRaw) {
          try {
            const legacyParsed = JSON.parse(legacyRaw) as Array<{ id: string; name: string; baseUrl: string }>;
            if (Array.isArray(legacyParsed)) {
              const migrated: Environment[] = legacyParsed.map((inst) => ({
                id: inst.id,
                name: inst.name,
                endpoints: [{ id: inst.id, kind: "direct" as const, url: inst.baseUrl, lastError: null, failureCount: 0 }],
                activeEndpointId: inst.id,
              }));
              setEnvironments(migrated);
              localStorage.setItem("lta.environments.v1", JSON.stringify(migrated));
              localStorage.removeItem("lta.instances.v1");
            }
          } catch { /* empty */ }
        }
      }
      const sid = localStorage.getItem("lta.selectedEnvironment.v1") ?? localStorage.getItem("lta.selectedInstance.v1");
      if (sid) setSelectedId(sid);
      setLoaded(true);
      return;
    }

    const migrateAndLoad = async (): Promise<void> => {
      const rawInstances = localStorage.getItem("lta.instances.v1");
      if (rawInstances) {
        const rawSelectedId = localStorage.getItem("lta.selectedInstance.v1");
        await window.api.config.migrateFromLocalStorage(rawInstances, rawSelectedId);
        localStorage.removeItem("lta.instances.v1");
        localStorage.removeItem("lta.selectedInstance.v1");
      }

      const [loadedEnvs, loadedId] = await Promise.all([
        window.api.config.getEnvironments(),
        window.api.config.getSelectedEnvironmentId(),
      ]);
      setEnvironments(loadedEnvs);
      setSelectedId(loadedId);
      setLoaded(true);
    };

    void migrateAndLoad();
  }, []);

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (window.api) {
        void window.api.config.setSelectedEnvironmentId(id);
      } else {
        if (id) localStorage.setItem("lta.selectedEnvironment.v1", id);
        else localStorage.removeItem("lta.selectedEnvironment.v1");
      }
    },
    [],
  );

  const add = useCallback(async (name: string, baseUrl: string, kind?: "direct" | "ssh" | "tailscale"): Promise<Environment> => {
    const trimmedUrl = baseUrl.trim().replace(/\/+$/, "");

    if (window.api) {
      const env = await window.api.config.addEnvironment(name, trimmedUrl, kind);
      setEnvironments(await window.api.config.getEnvironments());
      return env;
    }

    for (const env of environments) {
      const canReach = await probeUrl(trimmedUrl);
      if (canReach) {
        for (const ep of env.endpoints) {
          const epReachable = await probeUrl(ep.url);
          if (epReachable) {
            addEndpointFn(env.id, trimmedUrl, kind ?? "direct");
            return env;
          }
        }
      }
    }

    const endpointId = crypto.randomUUID().slice(0, 8);
    const env: Environment = {
      id: crypto.randomUUID().slice(0, 8),
      name: name.trim(),
      endpoints: [{
        id: endpointId,
        kind: kind ?? "direct",
        url: trimmedUrl,
        lastError: null,
        failureCount: 0,
      }],
      activeEndpointId: endpointId,
    };
    setEnvironments((prev) => {
      const next = [...prev, env];
      localStorage.setItem("lta.environments.v1", JSON.stringify(next));
      return next;
    });
    return env;
  }, [environments]);

  const remove = useCallback(
    (id: string) => {
      if (window.api) {
        void window.api.config.removeEnvironment(id).then(async () => {
          setEnvironments(await window.api.config.getEnvironments());
          setSelectedId(await window.api.config.getSelectedEnvironmentId());
        });
      } else {
        setEnvironments((prev) => {
          const next = prev.filter((e) => e.id !== id);
          localStorage.setItem("lta.environments.v1", JSON.stringify(next));
          return next;
        });
        setSelectedId((prev) => (prev === id ? null : prev));
      }
    },
    [],
  );

  const addEndpointFn = useCallback(
    (environmentId: string, url: string, kind: "direct" | "ssh" | "tailscale") => {
      if (window.api) {
        void window.api.config.addEndpoint(environmentId, url, kind).then(async () => {
          setEnvironments(await window.api.config.getEnvironments());
        });
      } else {
        setEnvironments((prev) => {
          const next = prev.map((env) => {
            if (env.id !== environmentId) return env;
            return {
              ...env,
              endpoints: [...env.endpoints, {
                id: crypto.randomUUID().slice(0, 8),
                kind,
                url: url.trim().replace(/\/+$/, ""),
                lastError: null,
                failureCount: 0,
              }],
            };
          });
          localStorage.setItem("lta.environments.v1", JSON.stringify(next));
          return next;
        });
      }
    },
    [],
  );

  const removeEndpointFn = useCallback(
    (environmentId: string, endpointId: string) => {
      if (window.api) {
        void window.api.config.removeEndpoint(environmentId, endpointId).then(async () => {
          setEnvironments(await window.api.config.getEnvironments());
        });
      } else {
        setEnvironments((prev) => {
          const next = prev.map((env) => {
            if (env.id !== environmentId) return env;
            const filtered = env.endpoints.filter((ep) => ep.id !== endpointId);
            return {
              ...env,
              endpoints: filtered,
              activeEndpointId: env.activeEndpointId === endpointId
                ? (filtered.length > 0 ? filtered[0].id : null)
                : env.activeEndpointId,
            };
          });
          localStorage.setItem("lta.environments.v1", JSON.stringify(next));
          return next;
        });
      }
    },
    [],
  );

  const setActiveEndpointFn = useCallback(
    (environmentId: string, endpointId: string) => {
      if (window.api) {
        void window.api.config.setActiveEndpoint(environmentId, endpointId).then(async () => {
          setEnvironments(await window.api.config.getEnvironments());
        });
      } else {
        setEnvironments((prev) => {
          const next = prev.map((env) => {
            if (env.id !== environmentId) return env;
            return { ...env, activeEndpointId: endpointId };
          });
          localStorage.setItem("lta.environments.v1", JSON.stringify(next));
          return next;
        });
      }
    },
    [],
  );

  if (!loaded) {
    return {
      environments: [],
      selectedId: null,
      select,
      add,
      remove,
      addEndpoint: addEndpointFn,
      removeEndpoint: removeEndpointFn,
      setActiveEndpoint: setActiveEndpointFn,
    };
  }

  return {
    environments,
    selectedId,
    select,
    add,
    remove,
    addEndpoint: addEndpointFn,
    removeEndpoint: removeEndpointFn,
    setActiveEndpoint: setActiveEndpointFn,
  };
}
