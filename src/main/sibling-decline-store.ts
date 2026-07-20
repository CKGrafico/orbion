// Persistent store for declined sibling structural offers.
// Uses electron-store in the main process. Stores declined
// (environmentId, loopId, fingerprint) triples so the same
// offer is not presented again.

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

/** Prune records older than 90 days. */
function pruneOld(): void {
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const current = store.get("declines", []);
  const pruned = current.filter((r) => r.declinedAt > cutoff);
  if (pruned.length !== current.length) {
    store.set("declines", pruned);
  }
}

/** Check whether a specific offer has been declined. */
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

/** Record a declined offer. */
export function recordDecline(environmentId: string, loopId: string, fingerprint: string): void {
  const records = store.get("declines", []);
  // Avoid duplicates
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
