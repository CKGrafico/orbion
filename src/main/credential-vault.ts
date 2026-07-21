import { safeStorage } from "electron";
import Store from "electron-store";
import crypto, { timingSafeEqual } from "node:crypto";
import { createLogger } from "./logger.js";

const logger = createLogger("credential-vault");

export class CredentialTamperedError extends Error {
  readonly reference: string;

  constructor(reference: string) {
    super("Credential integrity check failed");
    this.name = "CredentialTamperedError";
    this.reference = reference;
  }
}

interface CredentialRecord {
  encryptedValue: string;
  hmac?: string;
}

interface CredentialVaultSchema {
  credentials: Record<string, CredentialRecord>;
}

interface VaultKeySchema {
  encryptedKey: string;
}

const credentialStore = new Store<CredentialVaultSchema>({
  name: "credentials",
  defaults: {
    credentials: {},
  },
});

const vaultKeyStore = new Store<VaultKeySchema>({
  name: "credential-vault-key",
  defaults: {},
});

function getVaultKey(): Buffer {
  const existing = vaultKeyStore.get("encryptedKey");
  if (existing) {
    try {
      return Buffer.from(safeStorage.decryptString(Buffer.from(existing, "base64")), "hex");
    } catch {
      logger.error("Failed to decrypt existing vault key; generating a new one");
    }
  }

  const key = crypto.randomBytes(32);
  const encrypted = safeStorage.encryptString(key.toString("hex")).toString("base64");
  vaultKeyStore.set("encryptedKey", encrypted);
  return key;
}

function computeHmac(reference: string, encryptedValue: string): string {
  const key = getVaultKey();
  return crypto.createHmac("sha256", key).update(`${reference}:${encryptedValue}`).digest("base64");
}

export function storeCredential(value: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null;

  const reference = crypto.randomUUID();
  const encryptedValue = safeStorage.encryptString(value).toString("base64");
  const hmac = computeHmac(reference, encryptedValue);
  const credentials = credentialStore.get("credentials", {});
  credentials[reference] = { encryptedValue, hmac };
  credentialStore.set("credentials", credentials);
  return reference;
}

export function getCredential(reference: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null;

  const credentials = credentialStore.get("credentials", {});
  const record = credentials[reference];
  if (!record) return null;

  if (!record.hmac) {
    const hmac = computeHmac(reference, record.encryptedValue);
    credentials[reference] = { encryptedValue: record.encryptedValue, hmac };
    credentialStore.set("credentials", credentials);
    logger.info("Credential entry migrated to include integrity check:", reference);
  } else {
    const expected = computeHmac(reference, record.encryptedValue);
    const expectedBuf = Buffer.from(expected, "utf8");
    const actualBuf = Buffer.from(record.hmac, "utf8");
    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      logger.error("Credential integrity check failed:", reference);
      throw new CredentialTamperedError(reference);
    }
  }

  try {
    return safeStorage.decryptString(Buffer.from(record.encryptedValue, "base64"));
  } catch {
    return null;
  }
}

export function removeCredential(reference: string): void {
  const credentials = credentialStore.get("credentials", {});
  if (!(reference in credentials)) return;
  delete credentials[reference];
  credentialStore.set("credentials", credentials);
}

export function pruneOrphanCredentials(activeReferences: ReadonlySet<string>): number {
  const credentials = credentialStore.get("credentials", {});
  const orphans: string[] = [];

  for (const key of Object.keys(credentials)) {
    if (!activeReferences.has(key)) {
      orphans.push(key);
    }
  }

  if (orphans.length === 0) return 0;

  logger.warn(`Pruning ${orphans.length} orphaned credential(s):`, orphans);

  for (const key of orphans) {
    delete credentials[key];
  }
  credentialStore.set("credentials", credentials);
  return orphans.length;
}
