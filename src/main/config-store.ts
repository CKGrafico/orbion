import Store from "electron-store";
import { safeStorage } from "electron";

interface Instance {
  id: string;
  name: string;
  baseUrl: string;
}

interface ConfigSchema {
  instances: Instance[];
  selectedInstanceId: string | null;
  [key: string]: unknown;
}

const store = new Store<ConfigSchema>({
  defaults: {
    instances: [],
    selectedInstanceId: null,
  },
});

export function getInstances(): Instance[] {
  return store.get("instances", []);
}

export function addInstance(name: string, baseUrl: string): Instance {
  const instance: Instance = {
    id: crypto.randomUUID().slice(0, 8),
    name: name.trim(),
    baseUrl: baseUrl.trim().replace(/\/+$/, ""),
  };
  const instances = getInstances();
  store.set("instances", [...instances, instance]);
  return instance;
}

export function removeInstance(id: string): void {
  const instances = getInstances().filter((i) => i.id !== id);
  store.set("instances", instances);
  const selectedId = store.get("selectedInstanceId");
  if (selectedId === id) {
    store.set("selectedInstanceId", null);
  }
}

export function getSelectedInstanceId(): string | null {
  return store.get("selectedInstanceId", null);
}

export function setSelectedInstanceId(id: string | null): void {
  store.set("selectedInstanceId", id);
}

export function migrateFromLocalStorage(rawInstances: string, rawSelectedId: string | null): boolean {
  try {
    const parsed = JSON.parse(rawInstances) as Instance[];
    if (!Array.isArray(parsed)) return false;
    const current = getInstances();
    if (current.length === 0) {
      store.set("instances", parsed);
    }
    if (rawSelectedId) {
      store.set("selectedInstanceId", rawSelectedId);
    }
    return true;
  } catch {
    return false;
  }
}

export function encryptValue(plaintext: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null;
  return safeStorage.encryptString(plaintext).toString("base64");
}

export function decryptValue(encryptedBase64: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const buffer = Buffer.from(encryptedBase64, "base64");
    return safeStorage.decryptString(buffer);
  } catch {
    return null;
  }
}
