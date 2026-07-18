import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => ({
  encryptionAvailable: true,
  stores: new Map<string, Map<string, unknown>>(),
  encryptString: vi.fn((value: string) => Buffer.from(value, "utf8").map((byte) => byte ^ 0xa5)),
  decryptString: vi.fn((value: Buffer) => Buffer.from(value.map((byte) => byte ^ 0xa5)).toString("utf8")),
}));

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => electronMocks.encryptionAvailable,
    encryptString: electronMocks.encryptString,
    decryptString: electronMocks.decryptString,
  },
}));

vi.mock("electron-store", () => {
  function clone<T>(value: T): T {
    return value === undefined ? value : structuredClone(value);
  }

  return {
    default: class MemoryStore {
      readonly name: string;

      constructor(options: { name?: string; defaults?: Record<string, unknown> } = {}) {
        this.name = options.name ?? "config";
        const values = new Map<string, unknown>();
        for (const [key, value] of Object.entries(options.defaults ?? {})) {
          values.set(key, clone(value));
        }
        electronMocks.stores.set(this.name, values);
      }

      get<T>(key: string, defaultValue?: T): T {
        const value = electronMocks.stores.get(this.name)?.get(key);
        return clone((value === undefined ? defaultValue : value) as T);
      }

      set(key: string, value: unknown): void {
        let values = electronMocks.stores.get(this.name);
        if (!values) {
          values = new Map<string, unknown>();
          electronMocks.stores.set(this.name, values);
        }
        values.set(key, clone(value));
      }
    },
  };
});

import { getCredential, storeCredential } from "../src/main/credential-vault.js";
import {
  addEnvironment,
  getEnvironments,
  getEnvironmentsForRenderer,
  getSessionToken,
  getSshKeyPassphrase,
  removeEnvironment,
  storeSessionToken,
  storeSshKeyPassphrase,
} from "../src/main/config-store.js";

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Expected an object record");
  }
  return value as Record<string, unknown>;
}

function storeValues(name: string): Map<string, unknown> {
  const values = electronMocks.stores.get(name);
  if (!values) throw new Error(`Missing in-memory store: ${name}`);
  return values;
}

describe("credential vault", () => {
  beforeEach(() => {
    electronMocks.encryptionAvailable = true;
    electronMocks.encryptString.mockClear();
    electronMocks.decryptString.mockClear();
    for (const values of electronMocks.stores.values()) values.clear();
  });

  it("persists ciphertext rather than plaintext and decrypts it in main", () => {
    const plaintext = "correct horse battery staple";
    const reference = storeCredential(plaintext);

    expect(reference).toEqual(expect.any(String));
    const credentials = record(storeValues("credentials").get("credentials"));
    const stored = record(credentials[String(reference)]);
    expect(stored.encryptedValue).toEqual(expect.any(String));
    expect(stored.encryptedValue).not.toBe(plaintext);
    expect(JSON.stringify(stored)).not.toContain(plaintext);
    expect(getCredential(String(reference))).toBe(plaintext);
  });

  it("rejects writes when OS encryption is unavailable", () => {
    electronMocks.encryptionAvailable = false;

    expect(storeCredential("must-not-persist")).toBeNull();
    expect(storeValues("credentials").get("credentials")).toBeUndefined();
    expect(electronMocks.encryptString).not.toHaveBeenCalled();
  });
});

describe("environment credential ownership", () => {
  beforeEach(() => {
    electronMocks.encryptionAvailable = true;
    for (const values of electronMocks.stores.values()) values.clear();
  });

  it("defaults new and legacy environments to the OpenCode runtime", async () => {
    const created = await addEnvironment("Default runtime", "http://localhost:8845");
    expect(created.agentRuntime).toBe("opencode");

    storeValues("config").set("environments", [{
      id: "legacy-env",
      name: "Legacy",
      endpoints: [],
      activeEndpointId: null,
    }]);
    storeValues("config").set("instancesMigrated", true);

    expect(getEnvironments()[0]?.agentRuntime).toBe("opencode");
  });

  it("exposes only opaque references while main-process consumers resolve credentials", async () => {
    const accessToken = "daemon-session-secret";
    const passphrase = "ssh-key-secret";
    const environment = await addEnvironment("Secured", "http://localhost:8845", "direct", undefined, "claude");

    expect(await storeSessionToken(environment.id, {
      accessToken,
      scope: "operate",
      expiresAt: null,
    })).toBe(true);
    expect(await storeSshKeyPassphrase(environment.id, passphrase)).toBe(true);

    const exposed = getEnvironmentsForRenderer().find((candidate) => candidate.id === environment.id);
    expect(exposed?.credentialRefs?.sessionToken).toEqual(expect.any(String));
    expect(exposed?.credentialRefs?.sshKeyPassphrase).toEqual(expect.any(String));
    expect(JSON.stringify(exposed)).not.toContain(accessToken);
    expect(JSON.stringify(exposed)).not.toContain(passphrase);
    expect(JSON.stringify(exposed)).not.toContain("encryptedValue");
    expect(getSessionToken(environment.id)).toEqual({
      accessToken,
      scope: "operate",
      expiresAt: null,
    });
    expect(getSshKeyPassphrase(environment.id)).toBe(passphrase);
  });

  it("removes owned vault entries and a legacy session token with the environment", async () => {
    const environment = await addEnvironment("Disposable", "http://localhost:8845");
    await storeSessionToken(environment.id, {
      accessToken: "temporary-token",
      scope: "operate",
      expiresAt: null,
    });
    await storeSshKeyPassphrase(environment.id, "temporary-passphrase");

    const storedEnvironment = getEnvironments().find((candidate) => candidate.id === environment.id);
    const sessionReference = storedEnvironment?.credentialRefs?.sessionToken;
    const passphraseReference = storedEnvironment?.credentialRefs?.sshKeyPassphrase;
    expect(sessionReference).toEqual(expect.any(String));
    expect(passphraseReference).toEqual(expect.any(String));

    storeValues("config").set("sessionTokens", {
      [environment.id]: {
        encryptedAccessToken: "legacy-ciphertext",
        scope: "operate",
        expiresAt: null,
      },
    });

    await removeEnvironment(environment.id);

    expect(getEnvironments().some((candidate) => candidate.id === environment.id)).toBe(false);
    expect(getCredential(String(sessionReference))).toBeNull();
    expect(getCredential(String(passphraseReference))).toBeNull();
    expect(record(storeValues("config").get("sessionTokens"))[environment.id]).toBeUndefined();
  });
});
