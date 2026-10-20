import { beforeEach, describe, expect, it } from "vitest";
import { applyBackup, BACKUP_KEYS, createBackup, daysSinceBackup, parseBackup } from "../lib/backup";

const records = {
  clients: [{ id: "client-1", name: "Real Client", phone: "(555) 000-1111", createdAt: "", archived: false }],
  appointments: [{ id: "appt-1", date: "2030-01-07", time: "10:30", durationMin: 30, notes: "", clients: [{ clientId: "client-1", status: "completed", charge: 75 }] }],
  payments: [{ id: "pay-1", clientId: "client-1", amount: 75, method: "cash", paidAt: "2030-01-07T15:40:00.000Z", notes: "" }],
  blockedTimes: [],
};
const hours = { weekly: { 0: [{ start: "11:30", end: "13:30" }] }, overrides: { "2030-01-08": [] } };
const lock = { salt: "ab", hash: "cd", createdAt: "" };

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(BACKUP_KEYS.records, JSON.stringify(records));
  localStorage.setItem(BACKUP_KEYS.hours, JSON.stringify(hours));
  localStorage.setItem(BACKUP_KEYS.lock, JSON.stringify(lock));
});

describe("backup", () => {
  it("round-trips every record, the hours and the password through a file", () => {
    const text = JSON.stringify(createBackup(localStorage, new Date("2030-01-07T20:00:00Z")));
    localStorage.clear();
    const result = parseBackup(text);
    if ("error" in result) throw new Error(result.error);
    expect(result.summary).toEqual({ exportedAt: "2030-01-07T20:00:00.000Z", clients: 1, appointments: 1, payments: 1, hasPassword: true });
    applyBackup(localStorage, result.backup);
    expect(JSON.parse(localStorage.getItem(BACKUP_KEYS.records)!)).toEqual(records);
    expect(JSON.parse(localStorage.getItem(BACKUP_KEYS.hours)!)).toEqual(hours);
    expect(JSON.parse(localStorage.getItem(BACKUP_KEYS.lock)!)).toEqual(lock);
  });

  it("works on a device with nothing saved yet", () => {
    localStorage.clear();
    const backup = createBackup(localStorage);
    expect(backup.data.records.clients).toEqual([]);
    expect(backup.data.lock).toBeNull();
  });

  it("keeps the current password when the backup has none", () => {
    localStorage.removeItem(BACKUP_KEYS.lock);
    const backup = createBackup(localStorage);
    localStorage.setItem(BACKUP_KEYS.lock, JSON.stringify(lock));
    applyBackup(localStorage, backup);
    expect(JSON.parse(localStorage.getItem(BACKUP_KEYS.lock)!)).toEqual(lock);
  });

  it("rejects files that aren't backups", () => {
    expect(parseBackup("not json")).toEqual({ error: expect.stringMatching(/isn't an Electrolysis Scheduler backup/) });
    expect(parseBackup(JSON.stringify({ hello: 1 }))).toEqual({ error: expect.stringMatching(/isn't an Electrolysis Scheduler backup/) });
    const damaged = { ...createBackup(localStorage), data: { records: { clients: "oops" }, hours: null, lock: null } };
    expect(parseBackup(JSON.stringify(damaged))).toEqual({ error: expect.stringMatching(/damaged/) });
  });

  it("counts days since the last backup", () => {
    expect(daysSinceBackup(null)).toBeNull();
    expect(daysSinceBackup("2030-01-01T10:00:00Z", new Date("2030-01-08T11:00:00Z"))).toBe(7);
  });
});
