import Store from "electron-store";

interface SiblingDeclineRecord {
  environmentId: string;
  loopId: string;
  fingerprint: string;
  declinedAt: number;
}

interface DeclineStoreSchema {
  declines: SiblingDeclineRecord[];
}

const store = new Store<DeclineStoreSchema>({
  name: "sibling-declines",
  defaults: {
    declines: [],
  },
});

function pruneOld(): void {
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const current = store.get("declines", []);
  const pruned = current.filter((r) => r.declinedAt > cutoff);
  if (pruned.length !== current.length) {
    store.set("declines", pruned);
  }
}

export function isDeclined(environmentId: string, loopId: string, fingerprint: string): boolean {
  pruneOld();
  const records = store.get("declines", []);
  return records.some(
    (r) =>
      r.environmentId === environmentId &&
      r.loopId === loopId &&
      r.fingerprint === fingerprint,
  );
}

export function recordDecline(environmentId: string, loopId: string, fingerprint: string): void {
  const records = store.get("declines", []);
  const exists = records.some(
    (r) =>
      r.environmentId === environmentId &&
      r.loopId === loopId &&
      r.fingerprint === fingerprint,
  );
  if (!exists) {
    records.push({
      environmentId,
      loopId,
      fingerprint,
      declinedAt: Date.now(),
    });
    store.set("declines", records);
  }
}
