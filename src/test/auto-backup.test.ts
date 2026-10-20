import { describe, expect, it } from "vitest";
import { hasRecords, listSnapshots, saveSnapshot, type SnapshotStore } from "../lib/auto-backup";
import { createBackup } from "../lib/backup";

function memoryStore(): SnapshotStore {
  const map = new Map<string, unknown>();
  return {
    keys: async () => [...map.keys()],
    get: async (key) => map.get(key) as never,
    put: async (key, backup) => { map.set(key, structuredClone(backup)); },
    remove: async (key) => { map.delete(key); },
  };
}

function storageWith(clients: number) {
  localStorage.clear();
  localStorage.setItem("lumiere-scheduler-v2", JSON.stringify({ clients: Array.from({ length: clients }, (_, i) => ({ id: `c${i}`, name: "A", phone: "x" })), appointments: [], payments: [], blockedTimes: [] }));
  return localStorage;
}

describe("automatic backups", () => {
  it("never replace a copy with an empty device, so an erase can't overwrite them", async () => {
    const store = memoryStore();
    expect(await saveSnapshot(store, createBackup(storageWith(2), new Date("2030-01-07T10:00:00Z")))).toBe(true);
    expect(await saveSnapshot(store, createBackup(storageWith(0), new Date("2030-01-07T11:00:00Z")))).toBe(false);
    expect(hasRecords(createBackup(storageWith(0)))).toBe(false);
    expect((await listSnapshots(store))[0]!.summary.clients).toBe(2);
  });

  it("keep the latest plus the last 7 days, newest first, without listing a day twice", async () => {
    const store = memoryStore();
    for (let day = 1; day <= 10; day++) await saveSnapshot(store, createBackup(storageWith(day), new Date(`2030-01-${String(day).padStart(2, "0")}T10:00:00Z`)));
    const list = await listSnapshots(store);
    expect(list.map((item) => item.summary.clients)).toEqual([10, 9, 8, 7, 6, 5, 4]);
  });
});
