import { safeStorage } from "electron";
import Store from "electron-store";

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
