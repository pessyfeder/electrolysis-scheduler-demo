import { z } from "zod";

/** Device-storage keys that make up the studio's records. The password record is included; Admin unlock is never stored. */
export const BACKUP_KEYS = {
  records: "lumiere-scheduler-v2",
  hours: "lumiere-hours-v1",
  lock: "lumiere-lock-v1",
} as const;

export const LAST_BACKUP_KEY = "lumiere-last-backup-v1";
const FORMAT = "lumiere-electrolysis-backup";
const VERSION = 1;

/** Days after which the Dashboard nudges the practitioner to make a fresh backup. */
export const BACKUP_REMINDER_DAYS = 7;

const recordsSchema = z.object({
  clients: z.array(z.object({ id: z.string(), name: z.string(), phone: z.string() }).passthrough()),
  appointments: z.array(z.object({ id: z.string(), date: z.string(), time: z.string(), durationMin: z.number(), clients: z.array(z.object({ clientId: z.string(), status: z.string(), charge: z.number() }).passthrough()) }).passthrough()),
  payments: z.array(z.object({ id: z.string(), clientId: z.string(), amount: z.number(), paidAt: z.string() }).passthrough()),
  blockedTimes: z.array(z.object({ id: z.string(), date: z.string(), startTime: z.string(), endTime: z.string() }).passthrough()),
}).passthrough();

const hoursSchema = z.object({ weekly: z.record(z.array(z.object({ start: z.string(), end: z.string() }))), overrides: z.record(z.array(z.object({ start: z.string(), end: z.string() }))) });
const lockSchema = z.object({ salt: z.string(), hash: z.string() }).passthrough();

const backupSchema = z.object({
  format: z.literal(FORMAT),
  version: z.number().int().min(1).max(VERSION),
  exportedAt: z.string(),
  data: z.object({ records: recordsSchema, hours: hoursSchema.nullable(), lock: lockSchema.nullable() }),
});

export type Backup = z.infer<typeof backupSchema>;
export type BackupSummary = { exportedAt: string; clients: number; appointments: number; payments: number; hasPassword: boolean };

function readJson(storage: Storage, key: string): unknown {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** Snapshot of everything on this device, ready to save as a file. */
export function createBackup(storage: Storage, now: Date = new Date()): Backup {
  const records = readJson(storage, BACKUP_KEYS.records) ?? { clients: [], appointments: [], payments: [], blockedTimes: [] };
  // Damaged saved hours are left out rather than stopping the backup; the records are what matter.
  const hours = readJson(storage, BACKUP_KEYS.hours);
  return backupSchema.parse({
    format: FORMAT,
    version: VERSION,
    exportedAt: now.toISOString(),
    data: { records, hours: hoursSchema.safeParse(hours).success ? hours : null, lock: readJson(storage, BACKUP_KEYS.lock) },
  });
}

export function backupFileName(backup: Backup) {
  const stamp = backup.exportedAt.slice(0, 16).replace("T", "_").replace(":", "-");
  return `lumiere-backup-${stamp}.json`;
}

/** Reads a backup file's text; returns a plain-language error when it isn't a usable backup. */
export function parseBackup(text: string): { backup: Backup; summary: BackupSummary } | { error: string } {
  let json: unknown;
  try { json = JSON.parse(text); } catch { return { error: "This file isn't an Electrolysis Scheduler backup (it couldn't be read)." }; }
  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) {
    const format = (json as { format?: unknown } | null)?.format;
    if (format === FORMAT) return { error: "This backup is damaged or was made by a newer version of the app." };
    return { error: "This file isn't an Electrolysis Scheduler backup." };
  }
  const { data, exportedAt } = parsed.data;
  return {
    backup: parsed.data,
    summary: { exportedAt, clients: data.records.clients.length, appointments: data.records.appointments.length, payments: data.records.payments.length, hasPassword: Boolean(data.lock) },
  };
}

/** Replaces this device's records with the backup's. The page must reload afterwards so every screen reads the restored data. */
export function applyBackup(storage: Storage, backup: Backup) {
  const { records, hours, lock } = backup.data;
  storage.setItem(BACKUP_KEYS.records, JSON.stringify(records));
  if (hours) storage.setItem(BACKUP_KEYS.hours, JSON.stringify(hours));
  else storage.removeItem(BACKUP_KEYS.hours);
  // Keep the current password if the backup has none, so the device is never left unprotected.
  if (lock) storage.setItem(BACKUP_KEYS.lock, JSON.stringify(lock));
}

export function readLastBackup(storage: Storage): string | null {
  try { return storage.getItem(LAST_BACKUP_KEY); } catch { return null; }
}

export function markBackedUp(storage: Storage, when: Date = new Date()) {
  storage.setItem(LAST_BACKUP_KEY, when.toISOString());
}

/** Whole days since the last backup, or null when there has never been one. */
export function daysSinceBackup(lastBackup: string | null, now: Date = new Date()): number | null {
  if (!lastBackup) return null;
  return Math.floor((now.getTime() - new Date(lastBackup).getTime()) / 86_400_000);
}
