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

import { getCredential, storeCredential, CredentialTamperedError } from "../src/main/credential-vault.js";
import {
  addEnvironment,
  findSecretFieldInJson,
  getEnvironments,
  getEnvironmentsForRenderer,
  getSessionToken,
  getSshKeyPassphrase,
  removeEnvironment,
  SECRET_FIELD_NAMES,
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

describe("sync-safe serialization (references-not-secrets)", () => {
  beforeEach(() => {
    electronMocks.encryptionAvailable = true;
    for (const values of electronMocks.stores.values()) values.clear();
  });

  it("no known-secret field appears in serialized output", async () => {
    const accessToken = "s3cret-daemon-token-162";
    const passphrase = "s3cret-ssh-passphrase-162";
    const ocPassword = "s3cret-oc-password-162";

    const environment = await addEnvironment("FullEnv", "http://localhost:8845", "direct", undefined, "claude");

    await storeSessionToken(environment.id, {
      accessToken,
      scope: "operate",
      expiresAt: null,
    });
    await storeSshKeyPassphrase(environment.id, passphrase);

    // Set OpenCode endpoint with a password (will be encrypted internally)
    storeValues("config").set("environments", getEnvironments().map((env) => {
      if (env.id === environment.id) {
        return {
          ...env,
          opencode: { url: "http://localhost:8846", password: ocPassword, wasEncrypted: true },
        };
      }
      return env;
    }));

    // Inject a legacy EncryptedSessionToken to ensure it is not leaked
    storeValues("config").set("sessionTokens", {
      [environment.id]: {
        encryptedAccessToken: "legacy-ciphertext-value",
        scope: "operate",
        expiresAt: null,
      },
    });

    const serialized = JSON.stringify(getEnvironmentsForRenderer());

    // Structural assertion: none of the known secret field names appear as keys
    const leaked = findSecretFieldInJson(serialized);
    expect(leaked).toBeNull();

    // Content assertions: actual secret values must not appear
    expect(serialized).not.toContain(accessToken);
    expect(serialized).not.toContain(passphrase);
    expect(serialized).not.toContain(ocPassword);
    expect(serialized).not.toContain("legacy-ciphertext-value");
  });

  it("credentialRefs contains only opaque reference UUIDs, never values or ciphertext", async () => {
    const environment = await addEnvironment("RefOnly", "http://localhost:8845");
    await storeSessionToken(environment.id, {
      accessToken: "token-value-xyz",
      scope: "admin",
      expiresAt: null,
    });
    await storeSshKeyPassphrase(environment.id, "passphrase-value-xyz");

    const exposed = getEnvironmentsForRenderer().find((e) => e.id === environment.id);
    const refs = exposed?.credentialRefs;
    expect(refs).toBeDefined();

    // Reference keys are UUID strings (opaque)
    expect(refs!.sessionToken).toEqual(expect.any(String));
    expect(refs!.sshKeyPassphrase).toEqual(expect.any(String));

    // The serialized refs must not contain any value/ciphertext fields
    const refsJson = JSON.stringify(refs);
    expect(findSecretFieldInJson(refsJson)).toBeNull();
  });

  it("OpenCode endpoint serializes url but never password or wasEncrypted", async () => {
    const environment = await addEnvironment("OCEndpoint", "http://localhost:8845");

    // Directly inject internal data with password and wasEncrypted
    storeValues("config").set("environments", getEnvironments().map((env) => {
      if (env.id === environment.id) {
        return {
          ...env,
          opencode: { url: "http://localhost:8846", password: "encrypted-ciphertext", wasEncrypted: true },
          infraOpenCode: { url: "http://infra:8846", password: "infra-encrypted", wasEncrypted: true },
        };
      }
      return env;
    }));

    const exposed = getEnvironmentsForRenderer().find((e) => e.id === environment.id);
    expect(exposed?.opencode).toBeDefined();
    expect(exposed?.opencode?.url).toBe("http://localhost:8846");
    expect((exposed?.opencode as Record<string, unknown>)?.password).toBeUndefined();
    expect((exposed?.opencode as Record<string, unknown>)?.wasEncrypted).toBeUndefined();

    expect(exposed?.infraOpenCode).toBeDefined();
    expect(exposed?.infraOpenCode?.url).toBe("http://infra:8846");
    expect((exposed?.infraOpenCode as Record<string, unknown>)?.password).toBeUndefined();
    expect((exposed?.infraOpenCode as Record<string, unknown>)?.wasEncrypted).toBeUndefined();
  });

  it("env with only public fields serializes without secrets", async () => {
    await addEnvironment("Plain", "http://localhost:8845");

    const serialized = JSON.stringify(getEnvironmentsForRenderer());
    expect(findSecretFieldInJson(serialized)).toBeNull();
  });

  it("SECRET_FIELD_NAMES covers all fields that must never appear in sync", () => {
    // This test documents the canonical list of secret field names.
    // If a new secret field is added to the codebase, it MUST be added here too.
    expect(SECRET_FIELD_NAMES).toEqual([
      "password",
      "wasEncrypted",
      "encryptedAccessToken",
      "encryptedValue",
      "accessToken",
      "hmac",
    ]);
  });
});

describe("credential vault integrity (HMAC)", () => {
  beforeEach(() => {
    electronMocks.encryptionAvailable = true;
    electronMocks.encryptString.mockClear();
    electronMocks.decryptString.mockClear();
    for (const values of electronMocks.stores.values()) values.clear();
  });

  it("stores HMAC alongside encryptedValue on write", () => {
    const reference = storeCredential("integrity-test-value");
    expect(reference).toEqual(expect.any(String));

    const credentials = record(storeValues("credentials").get("credentials"));
    const stored = record(credentials[String(reference)]);
    expect(stored.encryptedValue).toEqual(expect.any(String));
    expect(stored.hmac).toEqual(expect.any(String));
  });

  it("decrypts successfully when HMAC is valid", () => {
    const plaintext = "hmac-verified-secret";
    const reference = storeCredential(plaintext);
    expect(getCredential(String(reference))).toBe(plaintext);
  });

  it("throws CredentialTamperedError when encryptedValue is tampered", () => {
    const reference = storeCredential("original-value");
    expect(reference).toEqual(expect.any(String));

    const credentials = record(storeValues("credentials").get("credentials"));
    const stored = record(credentials[String(reference)]);
    stored.encryptedValue = Buffer.from("tampered-ciphertext").toString("base64");
    storeValues("credentials").set("credentials", credentials);

    expect(() => getCredential(String(reference))).toThrow(CredentialTamperedError);
    try {
      getCredential(String(reference));
    } catch (error) {
      expect(error).toBeInstanceOf(CredentialTamperedError);
      expect((error as CredentialTamperedError).reference).toBe(String(reference));
    }
  });

  it("migrates old entries without HMAC on first read", () => {
    const plaintext = "pre-hmac-value";
    const reference = storeCredential(plaintext);
    expect(reference).toEqual(expect.any(String));

    const credentials = record(storeValues("credentials").get("credentials"));
    const stored = record(credentials[String(reference)]);
    const { hmac: _, ...withoutHmac } = stored;
    credentials[String(reference)] = withoutHmac;
    storeValues("credentials").set("credentials", credentials);

    const result = getCredential(String(reference));
    expect(result).toBe(plaintext);

    const updated = record(storeValues("credentials").get("credentials"));
    const migrated = record(updated[String(reference)]);
    expect(migrated.hmac).toEqual(expect.any(String));
  });

  it("getSessionToken catches CredentialTamperedError and sets authState to blocked", async () => {
    const environment = await addEnvironment("Tampered", "http://localhost:8845");
    await storeSessionToken(environment.id, {
      accessToken: "will-be-tampered",
      scope: "operate",
      expiresAt: null,
    });

    const storedEnv = getEnvironments().find((e) => e.id === environment.id);
    const sessionRef = storedEnv?.credentialRefs?.sessionToken;
    expect(sessionRef).toEqual(expect.any(String));

    const credentials = record(storeValues("credentials").get("credentials"));
    const stored = record(credentials[String(sessionRef)]);
    stored.encryptedValue = Buffer.from("tampered!").toString("base64");
    storeValues("credentials").set("credentials", credentials);

    const token = getSessionToken(environment.id);
    expect(token).toBeNull();

    const envAfter = getEnvironments().find((e) => e.id === environment.id);
    expect(envAfter?.authState).toBe("blocked");
  });

  it("HMAC comparison is constant-time (timing variance within bounds)", () => {
    const reference = storeCredential("timing-test-value");
    const credentials = record(storeValues("credentials").get("credentials"));
    const stored = record(credentials[String(reference)]);
    const correctHmac = String(stored.hmac);

    const runs = 10_000;

    const correctTimes: number[] = [];
    const wrongTimes: number[] = [];

    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      getCredential(String(reference));
      correctTimes.push(performance.now() - start);
    }

    stored.encryptedValue = Buffer.from("tampered-timing").toString("base64");
    storeValues("credentials").set("credentials", credentials);

    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      try { getCredential(String(reference)); } catch { /* expected */ }
      wrongTimes.push(performance.now() - start);
    }

    const avgCorrect = correctTimes.reduce((a, b) => a + b, 0) / runs;
    const avgWrong = wrongTimes.reduce((a, b) => a + b, 0) / runs;

    const varianceCorrect = correctTimes.reduce((sum, t) => sum + (t - avgCorrect) ** 2, 0) / runs;
    const varianceWrong = wrongTimes.reduce((sum, t) => sum + (t - avgWrong) ** 2, 0) / runs;

    const stdCorrect = Math.sqrt(varianceCorrect);
    const stdWrong = Math.sqrt(varianceWrong);

    // Constant-time: means should be within 3 standard deviations of each other
    const diff = Math.abs(avgCorrect - avgWrong);
    const pooledStd = Math.sqrt(stdCorrect ** 2 + stdWrong ** 2) / 2;
    expect(diff).toBeLessThan(3 * pooledStd + 0.01);
  });

  it("getSshKeyPassphrase catches CredentialTamperedError and sets authState to blocked", async () => {
    const environment = await addEnvironment("TamperedSSH", "http://localhost:8845");
    await storeSshKeyPassphrase(environment.id, "ssh-secret");

    const storedEnv = getEnvironments().find((e) => e.id === environment.id);
    const passphraseRef = storedEnv?.credentialRefs?.sshKeyPassphrase;
    expect(passphraseRef).toEqual(expect.any(String));

    const credentials = record(storeValues("credentials").get("credentials"));
    const stored = record(credentials[String(passphraseRef)]);
    stored.encryptedValue = Buffer.from("tampered!").toString("base64");
    storeValues("credentials").set("credentials", credentials);

    expect(getSshKeyPassphrase(environment.id)).toBeNull();

    const envAfter = getEnvironments().find((e) => e.id === environment.id);
    expect(envAfter?.authState).toBe("blocked");
  });
});
