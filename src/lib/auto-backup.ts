import { createBackup, parseBackup, type Backup, type BackupSummary } from "./backup";

/**
 * Automatic backups kept on this tablet, outside the app's normal records: after every change a copy is saved to
 * the browser's IndexedDB (the latest, plus the last state of each of the past days). "Erase and reset" only clears
 * the records in local storage, so the copies survive it and can be restored from Admin → Backup.
 */
export type SnapshotStore = {
  keys: () => Promise<string[]>;
  get: (key: string) => Promise<Backup | undefined>;
  put: (key: string, backup: Backup) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

const LATEST = "latest";
const DAY_PREFIX = "day-";
/** How many past days of snapshots to keep. */
export const DAYS_KEPT = 7;
const DELAY_MS = 3000;

export type SnapshotInfo = { key: string; backup: Backup; summary: BackupSummary };

/** An empty device (nothing booked, no clients or payments) never replaces a snapshot, so a wipe can't overwrite the copies. */
export function hasRecords(backup: Backup) {
  const { clients, appointments, payments, blockedTimes } = backup.data.records;
  return clients.length + appointments.length + payments.length + blockedTimes.length > 0;
}

const dayKey = (backup: Backup) => `${DAY_PREFIX}${backup.exportedAt.slice(0, 10)}`;

export async function saveSnapshot(store: SnapshotStore, backup: Backup): Promise<boolean> {
  if (!hasRecords(backup)) return false;
  await store.put(LATEST, backup);
  await store.put(dayKey(backup), backup);
  const days = (await store.keys()).filter((key) => key.startsWith(DAY_PREFIX)).sort();
  for (const old of days.slice(0, Math.max(0, days.length - DAYS_KEPT))) await store.remove(old);
  return true;
}

/** Saved snapshots, newest first (a day's copy that is identical to the latest is not listed twice). */
export async function listSnapshots(store: SnapshotStore): Promise<SnapshotInfo[]> {
  const found: SnapshotInfo[] = [];
  for (const key of await store.keys()) {
    const backup = await store.get(key);
    const parsed = backup ? parseBackup(JSON.stringify(backup)) : null;
    if (parsed && !("error" in parsed)) found.push({ key, backup: parsed.backup, summary: parsed.summary });
  }
  found.sort((a, b) => b.backup.exportedAt.localeCompare(a.backup.exportedAt));
  return found.filter((item, index) => index === 0 || item.backup.exportedAt !== found[index - 1]!.backup.exportedAt);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("lumiere-auto-backup", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("snapshots");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction("snapshots", mode).objectStore("snapshots"));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export const deviceSnapshots: SnapshotStore = {
  keys: async () => (await run("readonly", (s) => s.getAllKeys())).map(String),
  get: (key) => run("readonly", (s) => s.get(key)) as Promise<Backup | undefined>,
  put: async (key, backup) => { await run("readwrite", (s) => s.put(backup, key)); },
  remove: async (key) => { await run("readwrite", (s) => s.delete(key)); },
};

export const autoBackupAvailable = () => typeof indexedDB !== "undefined";

/** Snapshot of what is on this device right now; failures are ignored (the normal save and manual backups still work). */
export async function snapshotNow(): Promise<void> {
  if (!autoBackupAvailable()) return;
  try {
    await saveSnapshot(deviceSnapshots, createBackup(window.localStorage));
    void navigator.storage?.persist?.();
  } catch { /* storage unavailable: nothing to do */ }
}

let timer: number | undefined;

/** Called after each save of the records: takes the snapshot a few seconds later, once changes settle. */
export function queueSnapshot() {
  if (!autoBackupAvailable() || typeof window === "undefined") return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void snapshotNow(), DELAY_MS);
}
