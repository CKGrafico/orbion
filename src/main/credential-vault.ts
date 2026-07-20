import { safeStorage } from "electron";
import Store from "electron-store";
import { createLogger } from "./logger.js";

const logger = createLogger("credential-vault");

interface CredentialRecord {
  encryptedValue: string;
}

interface CredentialVaultSchema {
  credentials: Record<string, CredentialRecord>;
}

const credentialStore = new Store<CredentialVaultSchema>({
  name: "credentials",
  defaults: {
    credentials: {},
  },
});

export function storeCredential(value: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null;

  const reference = crypto.randomUUID();
  const encryptedValue = safeStorage.encryptString(value).toString("base64");
  const credentials = credentialStore.get("credentials", {});
  credentials[reference] = { encryptedValue };
  credentialStore.set("credentials", credentials);
  return reference;
}

export function getCredential(reference: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null;

  const record = credentialStore.get("credentials", {})[reference];
  if (!record) return null;

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

/**
 * Remove credentials that are no longer referenced by any environment.
 * Accepts the set of active reference UUIDs (session tokens + SSH key passphrases
 * from all environments) and deletes any credential store entry not in that set.
 * Returns the number of orphaned credentials that were pruned.
 */
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
