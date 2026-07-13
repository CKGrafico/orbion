import { useCallback, useEffect, useState } from "react";
import type { Instance } from "./types";

export function useInstances(): {
  instances: Instance[];
  selectedId: string | null;
  select: (id: string | null) => void;
  add: (name: string, baseUrl: string) => Promise<Instance>;
  remove: (id: string) => void;
} {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!window.api) {
      const raw = localStorage.getItem("lta.instances.v1");
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Instance[];
          if (Array.isArray(parsed)) setInstances(parsed);
        } catch { /* empty */ }
      }
      const sid = localStorage.getItem("lta.selectedInstance.v1");
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

      const [loadedInstances, loadedId] = await Promise.all([
        window.api.config.getInstances(),
        window.api.config.getSelectedInstanceId(),
      ]);
      setInstances(loadedInstances);
      setSelectedId(loadedId);
      setLoaded(true);
    };

    void migrateAndLoad();
  }, []);

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (window.api) {
        void window.api.config.setSelectedInstanceId(id);
      } else {
        if (id) localStorage.setItem("lta.selectedInstance.v1", id);
        else localStorage.removeItem("lta.selectedInstance.v1");
      }
    },
    [],
  );

  const add = useCallback(async (name: string, baseUrl: string): Promise<Instance> => {
    if (window.api) {
      const instance = await window.api.config.addInstance(name, baseUrl);
      setInstances(await window.api.config.getInstances());
      return instance;
    }
    const instance: Instance = {
      id: crypto.randomUUID().slice(0, 8),
      name: name.trim(),
      baseUrl: baseUrl.trim().replace(/\/+$/, ""),
    };
    setInstances((prev) => {
      const next = [...prev, instance];
      localStorage.setItem("lta.instances.v1", JSON.stringify(next));
      return next;
    });
    return instance;
  }, []);

  const remove = useCallback(
    (id: string) => {
      if (window.api) {
        void window.api.config.removeInstance(id).then(async () => {
          setInstances(await window.api.config.getInstances());
          setSelectedId(await window.api.config.getSelectedInstanceId());
        });
      } else {
        setInstances((prev) => {
          const next = prev.filter((i) => i.id !== id);
          localStorage.setItem("lta.instances.v1", JSON.stringify(next));
          return next;
        });
        setSelectedId((prev) => (prev === id ? null : prev));
      }
    },
    [],
  );

  if (!loaded) {
    return { instances: [], selectedId: null, select, add, remove };
  }

  return { instances, selectedId, select, add, remove };
}
