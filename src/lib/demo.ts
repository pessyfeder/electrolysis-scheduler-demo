import { BACKUP_KEYS } from "./backup";
import { DEFAULT_WEEKLY } from "./availability";
import { minutesToTime, timeToMinutes, timeToISO, toDateKey, type Adjustment, type Appointment, type Client, type Payment } from "./data";
import { createLockRecord, readLockRecord, verifyPassphrase, wipeStudioData, writeLockRecord } from "./privacy";
import { noShowCharge, RATE_PER_MINUTE } from "./scheduling";

/** This copy of the app is the public demo: it fills itself with made-up sample records. The real app has no such file. */
export const DEMO_MODE = true;
export const DEMO_PASSWORD = "demo";

const SEEDED_KEY = "lumiere-demo-seeded-v1";
/** Sample dates are relative to the day they were made, so a visitor returning after this many days gets a fresh set. */
const REFRESH_AFTER_DAYS = 5;

// All names and numbers are invented (555-01xx numbers are reserved for fiction).
const CLIENT_SEEDS: [string, string][] = [
  ["Rachel Cohen", "(555) 010-0101"],
  ["Miriam Katz", "(555) 010-0102"],
  ["Leah Goldberg", "(555) 010-0103"],
  ["Esther Weiss", "(555) 010-0104"],
  ["Sara Klein", "(555) 010-0105"],
  ["Devorah Stern", "(555) 010-0106"],
  ["Chana Rosen", "(555) 010-0107"],
  ["Rivka Adler", "(555) 010-0108"],
];

const DURATIONS = [30, 45, 60, 30, 45, 90];

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Sample records: about three weeks of history and a week and a half of upcoming bookings, inside the default working hours. */
export function buildDemoRecords(today: Date = new Date()) {
  const clients: Client[] = CLIENT_SEEDS.map(([name, phone], index) => ({
    id: `demo-client-${index + 1}`,
    name,
    phone,
    createdAt: addDays(today, -60 + index).toISOString(),
    archived: false,
  }));
  const appointments: Appointment[] = [];
  const payments: Payment[] = [];
  const todayKey = toDateKey(today);
  let serial = 0;
  let noShowDone = false;

  for (let offset = -21; offset <= 10; offset += 1) {
    const day = addDays(today, offset);
    const date = toDateKey(day);
    const block = DEFAULT_WEEKLY[day.getDay()]?.[0];
    if (!block) continue;
    const slots = [timeToMinutes(block.start), timeToMinutes(block.start) + 60];
    slots.forEach((slot, slotIndex) => {
      serial += 1;
      // Leave some gaps open so booking has free times to show.
      if ((serial + slotIndex) % 4 === 0) return;
      const durationMin = DURATIONS[serial % DURATIONS.length] ?? 30;
      const client = clients[serial % clients.length]!;
      const time = minutesToTime(slot);
      const id = `demo-appt-${serial}`;
      const past = date < todayKey;
      if (!past) {
        appointments.push({ id, date, time, durationMin, notes: "", clients: [{ clientId: client.id, status: "scheduled", charge: 0 }] });
        return;
      }
      if (!noShowDone && offset <= -8 && offset >= -12) {
        noShowDone = true;
        appointments.push({ id, date, time, durationMin, notes: "Did not arrive.", clients: [{ clientId: client.id, status: "no_show", charge: noShowCharge({ durationMin }) }] });
        return;
      }
      const startedAt = timeToISO(date, time);
      const endedAt = timeToISO(date, minutesToTime(slot + durationMin));
      const charge = durationMin * RATE_PER_MINUTE;
      appointments.push({ id, date, time, durationMin, notes: "", startedAt, endedAt, clients: [{ clientId: client.id, status: "completed", charge, startedAt, endedAt, pausedMs: 0 }] });
      // Most visits are paid on the day; the newest few stay unpaid so balances show.
      if (offset < -4) {
        payments.push({ id: `demo-pay-${serial}`, clientId: client.id, amount: charge, method: serial % 3 === 0 ? "card" : "cash", paidAt: endedAt, notes: "" });
      }
    });
  }

  const adjustments: Adjustment[] = [
    { id: "demo-adj-1", clientId: clients[1]!.id, amount: -10, reason: "Courtesy credit", createdAt: addDays(today, -9).toISOString() },
  ];
  return { clients, appointments, payments, adjustments, blockedTimes: [] };
}

function seedIsFresh(storage: Storage, today: Date) {
  if (!storage.getItem(BACKUP_KEYS.records)) return false;
  const seeded = Number(storage.getItem(SEEDED_KEY));
  return Number.isFinite(seeded) && seeded > 0 && today.getTime() - seeded < REFRESH_AFTER_DAYS * 86_400_000;
}

/** Fills the device with sample records (and the demo password) when it is new or the sample is out of date. */
export async function ensureDemoData(storage: Storage = window.localStorage, today: Date = new Date()) {
  if (!seedIsFresh(storage, today)) {
    storage.setItem(BACKUP_KEYS.records, JSON.stringify(buildDemoRecords(today)));
    storage.removeItem(BACKUP_KEYS.hours);
    storage.setItem(SEEDED_KEY, String(today.getTime()));
  }
  // Replace any other password left on this device, so the demo password always works.
  const record = readLockRecord();
  if (!record || !(await verifyPassphrase(DEMO_PASSWORD, record))) writeLockRecord(await createLockRecord(DEMO_PASSWORD, `The demo password is "${DEMO_PASSWORD}".`));
}

/** Throws away this visitor's changes; the sample records are rebuilt when the page reloads. */
export function resetDemo() {
  wipeStudioData();
  window.location.assign("/book");
}
